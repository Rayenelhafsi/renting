import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../config/app_config.dart';
import '../services/dwira_api_service.dart';
import '../services/push_notification_service.dart';
import '../services/session_storage.dart';
import 'add_house_screen.dart';
import 'api_admin_bien_details_screen.dart';
import 'create_owner_screen.dart';
import 'house_details.dart';
import 'login_screen.dart';

class AdminHomeScreen extends StatefulWidget {
  const AdminHomeScreen({super.key});

  @override
  State<AdminHomeScreen> createState() => _AdminHomeScreenState();
}

class _AdminHomeScreenState extends State<AdminHomeScreen> {
  final DwiraApiService _api = DwiraApiService.instance;

  Future<List<_ApiOwner>>? _apiOwnersFuture;
  Future<List<List<Map<String, dynamic>>>>? _approvalDataFuture;
  Future<List<Map<String, dynamic>>>? _chatMessagesFuture;
  Future<List<List<Map<String, dynamic>>>>? _notificationsDataFuture;

  final TextEditingController _chatMessageController = TextEditingController();
  bool _sendingAdminMessage = false;
  String? _selectedChatOwnerId;
  String? _selectedChatBienId;
  String? _selectedChatPropertyTitle;
  _AdminNotificationFilter _notificationFilter = _AdminNotificationFilter.all;
  _ApprovalTabFilter _approvalTabFilter = _ApprovalTabFilter.pending;
  final Set<String> _processedApprovalIds = <String>{};
  final Map<String, Map<String, dynamic>> _localApprovalPayloads =
      <String, Map<String, dynamic>>{};
  final Set<String> _seenAdminAlertIds = <String>{};
  Timer? _autoRefreshTimer;
  StreamSubscription<String>? _adminTokenRefreshSubscription;
  int _adminUnreadNotifications = 0;
  bool _sessionRedirectScheduled = false;
  bool _adminAlertBaselineLoaded = false;
  bool _initializingAdminNotifications = false;

  Future<void> _openApiHouseDetails(_ApiHouse house) async {
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ApiAdminBienDetailsScreen(bienId: house.id),
      ),
    );
  }

  Stream<List<Map<String, dynamic>>> _ownersWithHousesStream() {
    final usersStream = FirebaseFirestore.instance
        .collection('users')
        .where('role', isEqualTo: 'owner')
        .snapshots();

    final housesStream =
        FirebaseFirestore.instance.collection('houses').snapshots();

    return usersStream.asyncMap((usersSnapshot) async {
      final housesSnapshot = await housesStream.first;

      final Map<String, List<DocumentSnapshot>> ownerHousesMap = {};
      for (var house in housesSnapshot.docs) {
        final ownerId = house['ownerId'];
        if (ownerHousesMap.containsKey(ownerId)) {
          ownerHousesMap[ownerId]!.add(house);
        } else {
          ownerHousesMap[ownerId] = [house];
        }
      }

      return usersSnapshot.docs.map((ownerDoc) {
        final ownerId = ownerDoc.id;
        return {
          'owner': ownerDoc,
          'houses': ownerHousesMap[ownerId] ?? [],
        };
      }).toList();
    });
  }

  @override
  void initState() {
    super.initState();
    if (AppConfig.useDwiraApi) {
      if (!_api.isAdminAuthenticated) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          _redirectToLoginAfterSessionExpiry(showMessage: false);
        });
        return;
      }
      _initAdminNotifications();
      _refreshAllApiTabs();
      _startAutoRefresh();
    }
  }

  @override
  void dispose() {
    _autoRefreshTimer?.cancel();
    _adminTokenRefreshSubscription?.cancel();
    _chatMessageController.dispose();
    super.dispose();
  }

  void _startAutoRefresh() {
    _autoRefreshTimer?.cancel();
    _autoRefreshTimer = Timer.periodic(const Duration(seconds: 8), (_) {
      if (!mounted || !AppConfig.useDwiraApi) return;
      _refreshRealtimeData();
    });
  }

  void _refreshRealtimeData() {
    final approvalRequestsFuture =
        _api.fetchCalendarUpdateRequestsAdmin(statuses: {'pending'});
    final approvalHistoryFuture = _api.fetchCalendarUpdateHistoryAdmin();
    final notificationsFuture = _api.fetchNotificationsAdmin();
    final communicationNotificationsFuture =
        _api.fetchCommunicationNotificationsAdmin();

    setState(() {
      _approvalDataFuture =
          Future.wait([approvalRequestsFuture, approvalHistoryFuture]);
      _notificationsDataFuture = Future.wait(
        [notificationsFuture, communicationNotificationsFuture],
      );
      _apiOwnersFuture = _fetchApiOwnersWithHouses();
      if ((_selectedChatOwnerId ?? '').trim().isNotEmpty) {
        _chatMessagesFuture = _api.fetchOwnerChatMessages(
          _selectedChatOwnerId!.trim(),
          bienId: (_selectedChatBienId ?? '').trim().isEmpty
              ? null
              : _selectedChatBienId,
        );
      }
    });
    _watchAdminNotificationFutures(
      notificationsFuture,
      communicationNotificationsFuture,
    );
  }

  void _refreshAllApiTabs() {
    final approvalRequestsFuture =
        _api.fetchCalendarUpdateRequestsAdmin(statuses: {'pending'});
    final approvalHistoryFuture = _api.fetchCalendarUpdateHistoryAdmin();
    final notificationsFuture = _api.fetchNotificationsAdmin();
    final communicationNotificationsFuture =
        _api.fetchCommunicationNotificationsAdmin();

    setState(() {
      _apiOwnersFuture = _fetchApiOwnersWithHouses();
      _approvalDataFuture =
          Future.wait([approvalRequestsFuture, approvalHistoryFuture]);
      _notificationsDataFuture = Future.wait(
        [notificationsFuture, communicationNotificationsFuture],
      );
      if ((_selectedChatOwnerId ?? '').trim().isNotEmpty) {
        _chatMessagesFuture = _api.fetchOwnerChatMessages(
          _selectedChatOwnerId!.trim(),
          bienId: (_selectedChatBienId ?? '').trim().isEmpty
              ? null
              : _selectedChatBienId,
        );
      }
    });
    _watchAdminNotificationFutures(
      notificationsFuture,
      communicationNotificationsFuture,
    );
  }

  Future<void> _initAdminNotifications() async {
    if (_initializingAdminNotifications) return;
    _initializingAdminNotifications = true;
    try {
      final push = PushNotificationService.instance;
      final permission = await push.requestPermission();
      if (permission.authorizationStatus.name == 'denied') {
        return;
      }
      final token = (await push.getToken())?.trim() ?? '';
      if (token.isNotEmpty) {
        await _api.registerAdminPushToken(
          token: token,
          platform: kIsWeb ? 'web' : 'mobile',
        );
      }
      _adminTokenRefreshSubscription?.cancel();
      _adminTokenRefreshSubscription = push.onTokenRefresh.listen((nextToken) {
        _api
            .registerAdminPushToken(
              token: nextToken,
              platform: kIsWeb ? 'web' : 'mobile',
            )
            .catchError((_) {});
      });
    } catch (_) {
      // Local polling still works even if permission request fails.
    } finally {
      _initializingAdminNotifications = false;
    }
  }

  void _watchAdminNotificationFutures(
    Future<List<Map<String, dynamic>>> notificationsFuture,
    Future<List<Map<String, dynamic>>> communicationNotificationsFuture,
  ) {
    Future.wait([notificationsFuture, communicationNotificationsFuture]).then((
      results,
    ) {
      if (!mounted) return;
      final merged = <Map<String, dynamic>>[
        ...results[0],
        ...results[1],
      ];
      _maybeNotifyAdminEvents(merged);
    }).catchError((_) {});
  }

  Future<void> _maybeNotifyAdminEvents(
    List<Map<String, dynamic>> notifications,
  ) async {
    final unreadCount =
        notifications.where((item) => item['lu'] != true).length;
    if (mounted && _adminUnreadNotifications != unreadCount) {
      setState(() {
        _adminUnreadNotifications = unreadCount;
      });
    }

    final candidates = notifications
        .where(_isAdminAlertNotification)
        .map((n) {
          final map = Map<String, dynamic>.from(n);
          final id = (map['id'] ?? '').toString().trim();
          if (id.isNotEmpty) {
            map['_alertId'] = id;
          }
          return map;
        })
        .where((n) => (n['_alertId'] ?? '').toString().isNotEmpty)
        .toList()
      ..sort((a, b) => (a['created_at'] ?? '')
          .toString()
          .compareTo((b['created_at'] ?? '').toString()));

    if (!_adminAlertBaselineLoaded) {
      _seenAdminAlertIds.addAll(
        candidates.map((item) => (item['_alertId'] ?? '').toString()),
      );
      _adminAlertBaselineLoaded = true;
      return;
    }

    final newItems = candidates.where((item) {
      final id = (item['_alertId'] ?? '').toString();
      return !_seenAdminAlertIds.contains(id);
    }).toList();

    if (newItems.isEmpty) return;

    for (final item in newItems) {
      final alertId = (item['_alertId'] ?? '').toString();
      _seenAdminAlertIds.add(alertId);
      final title = _adminAlertTitle(item);
      final body = (item['message'] ?? '').toString().trim();
      if (body.isEmpty) continue;
      await PushNotificationService.instance.showAdminAlertNotification(
        notificationId: alertId,
        title: title,
        body: body,
      );
    }
  }

  bool _isAdminAlertNotification(Map<String, dynamic> notif) {
    final kind = (notif['kind'] ?? '').toString().toLowerCase();
    final type = (notif['type'] ?? '').toString().toLowerCase();
    return kind == 'calendar_update_request' ||
        type == 'reservation_attempt' ||
        type == 'reservation_submitted';
  }

  String _adminAlertTitle(Map<String, dynamic> notif) {
    final kind = (notif['kind'] ?? '').toString().toLowerCase();
    final type = (notif['type'] ?? '').toString().toLowerCase();
    if (kind == 'calendar_update_request') {
      return 'Mise a jour calendrier';
    }
    if (type == 'reservation_attempt' || type == 'reservation_submitted') {
      return 'Nouvelle reservation';
    }
    return 'Alerte admin';
  }

  void _refreshChatThread() {
    final ownerId = (_selectedChatOwnerId ?? '').trim();
    if (ownerId.isEmpty) {
      setState(() => _chatMessagesFuture = null);
      return;
    }
    setState(() {
      _chatMessagesFuture = _api.fetchOwnerChatMessages(
        ownerId,
        bienId: (_selectedChatBienId ?? '').trim().isEmpty
            ? null
            : _selectedChatBienId,
      );
    });
  }

  void _logout(BuildContext context) async {
    await PersistedSession.clear();
    if (AppConfig.useDwiraApi) {
      await _api.logoutAdmin();
    }
    await FirebaseAuth.instance.signOut();
    if (!context.mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (context) => const LoginScreen()),
      (route) => false,
    );
  }

  bool _looksLikeSessionExpired(Object? error) {
    final text = (error ?? '').toString().toLowerCase();
    return text.contains('session admin expir') ||
        text.contains('session expired') ||
        text.contains('http 401') ||
        text.contains('authentification requise');
  }

  void _redirectToLoginAfterSessionExpiry({bool showMessage = true}) {
    if (!mounted || _sessionRedirectScheduled) return;
    _sessionRedirectScheduled = true;
    _autoRefreshTimer?.cancel();
    if (showMessage) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Session admin expirée. Reconnectez-vous.'),
        ),
      );
    }
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (route) => false,
    );
  }

  void _navigateToCreateOwner() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => const CreateOwnerScreen(),
      ),
    ).then((_) => _refreshAllApiTabs());
  }

  void _navigateToAddHouseOwner(_ApiOwner owner) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => AddHouseScreen(ownerId: owner.id),
      ),
    ).then((_) => _refreshAllApiTabs());
  }

  Future<void> _sendAdminMessage() async {
    final ownerId = (_selectedChatOwnerId ?? '').trim();
    final bienId = (_selectedChatBienId ?? '').trim();
    final propertyTitle = (_selectedChatPropertyTitle ?? '').trim();
    final text = _chatMessageController.text.trim();
    if (ownerId.isEmpty || text.isEmpty) return;

    setState(() => _sendingAdminMessage = true);
    try {
      await _api.sendAdminChatMessage(
        ownerId: ownerId,
        text: text,
        bienId: bienId.isEmpty ? null : bienId,
        propertyTitle: propertyTitle.isEmpty ? null : propertyTitle,
      );
      await _api.createNotificationAdmin(
        type: 'info',
        message:
            'Message admin envoyé au proprietaire $ownerId${bienId.isEmpty ? '' : ' (bien $bienId)'}',
      );
      _chatMessageController.clear();
      _refreshChatThread();
      setState(() {
        _notificationsDataFuture = Future.wait([
          _api.fetchNotificationsAdmin(),
          _api.fetchCommunicationNotificationsAdmin(),
        ]);
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Message admin envoye.')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Echec envoi message admin: $e')),
      );
    } finally {
      if (mounted) setState(() => _sendingAdminMessage = false);
    }
  }

  Future<void> _approveCalendarRequest(Map<String, dynamic> request) async {
    final interactionId = (request['id'] ?? '').toString().trim();
    if (interactionId.isEmpty) return;
    try {
      await _api.approveCalendarRequestAdmin(interactionId);
      if (mounted) {
        setState(() {
          _processedApprovalIds.add(interactionId);
          final metadata = (request['metadata'] is Map)
              ? Map<String, dynamic>.from(request['metadata'] as Map)
              : <String, dynamic>{};
          metadata['status'] = 'approved';
          metadata['reviewedAt'] = DateTime.now().toIso8601String();
          final next = Map<String, dynamic>.from(request);
          next['metadata'] = metadata;
          _localApprovalPayloads[interactionId] = next;
        });
      }

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Demande approuvee et calendrier mis a jour.')),
      );
      _refreshAllApiTabs();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Echec approbation: $e')),
      );
    }
  }

  Future<void> _rejectCalendarRequest(Map<String, dynamic> request) async {
    final interactionId = (request['id'] ?? '').toString().trim();
    if (interactionId.isEmpty) return;
    try {
      await _api.rejectCalendarRequestAdmin(interactionId);
      if (mounted) {
        setState(() {
          _processedApprovalIds.add(interactionId);
          final metadata = (request['metadata'] is Map)
              ? Map<String, dynamic>.from(request['metadata'] as Map)
              : <String, dynamic>{};
          metadata['status'] = 'rejected';
          metadata['reviewedAt'] = DateTime.now().toIso8601String();
          final next = Map<String, dynamic>.from(request);
          next['metadata'] = metadata;
          _localApprovalPayloads[interactionId] = next;
        });
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Demande rejetee.')),
      );
      _refreshAllApiTabs();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Echec rejet: $e')),
      );
    }
  }

  Future<List<_ApiOwner>> _fetchApiOwnersWithHouses() async {
    final results = await Future.wait<List<Map<String, dynamic>>>([
      _api.fetchBiens(),
      _api.fetchProprietairesAdmin(),
    ]);
    final biens = results[0];
    final proprietaires = results[1];

    final ownerInfoById = <String, Map<String, String>>{};
    final ownerInfoByIdUpper = <String, Map<String, String>>{};
    for (final owner in proprietaires) {
      final id = (owner['id'] ?? '').toString().trim();
      if (id.isEmpty) continue;
      final payload = <String, String>{
        'nom': (owner['nom'] ?? '').toString().trim(),
        'telephone': (owner['telephone'] ?? '').toString().trim(),
      };
      ownerInfoById[id] = payload;
      ownerInfoByIdUpper[id.toUpperCase()] = payload;
    }

    final ownersById = <String, _ApiOwnerBuilder>{};
    for (final map in biens) {
      final ownerId = (map['proprietaire_id'] ?? '').toString().trim();
      if (ownerId.isEmpty) continue;

      final ownerRef = ownerInfoById[ownerId] ??
          ownerInfoByIdUpper[ownerId.toUpperCase()] ??
          const <String, String>{};
      final ownerName =
          (map['proprietaire_nom'] ?? ownerRef['nom'] ?? 'Proprietaire')
              .toString()
              .trim();
      final ownerPhone = (map['proprietaire_telephone'] ??
              map['proprietaire_phone'] ??
              map['owner_phone'] ??
              map['phone'] ??
              ownerRef['telephone'] ??
              map['telephone'] ??
              '')
          .toString()
          .trim();
      final houseTitle =
          (map['titre'] ?? map['reference'] ?? 'Bien').toString().trim();
      final houseId = (map['id'] ?? '').toString().trim();
      if (houseId.isEmpty) continue;

      ownersById.putIfAbsent(
        ownerId,
        () => _ApiOwnerBuilder(
          id: ownerId,
          name: ownerName.isEmpty ? 'Proprietaire' : ownerName,
          phone: ownerPhone,
        ),
      );
      ownersById[ownerId]!
          .houses
          .add(_ApiHouse(id: houseId, title: houseTitle));
    }

    final owners = ownersById.values
        .map((builder) => _ApiOwner(
              id: builder.id,
              name: builder.name,
              phone: builder.phone,
              houses: builder.houses,
            ))
        .toList()
      ..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));

    return owners;
  }

  Widget _buildApiOwnerCard(_ApiOwner owner) {
    final isSmallScreen = MediaQuery.of(context).size.width < 420;
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      elevation: 2.5,
      shadowColor: const Color(0x1F0F172A),
      color: Colors.white,
      shape: RoundedRectangleBorder(
        side:
            BorderSide(color: const Color(0xFF2F7D4B).withValues(alpha: 0.35)),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: isSmallScreen ? 78 : 88,
                  height: isSmallScreen ? 78 : 88,
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF8FAFC),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: const Color(0xFFE5E7EB)),
                  ),
                  child: QrImageView(
                    data: owner.id,
                    size: isSmallScreen ? 62 : 72,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        owner.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: isSmallScreen ? 18 : 20,
                          fontWeight: FontWeight.w700,
                          color: const Color(0xFF1F2937),
                          height: 1.1,
                        ),
                      ),
                      const SizedBox(height: 7),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: const Color(0xFFEAF6EE),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          owner.phone.isEmpty
                              ? 'Telephone non renseigne'
                              : owner.phone,
                          style: TextStyle(
                            fontSize: isSmallScreen ? 13 : 14,
                            color: const Color(0xFF2F7D4B),
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'ID: ${owner.id}',
                        style: const TextStyle(
                            fontSize: 12, color: Color(0xFF6B7280)),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: owner.houses
                  .map((house) => ActionChip(
                        avatar: Icon(
                          Icons.home_work_outlined,
                          size: isSmallScreen ? 14 : 15,
                          color: const Color(0xFF2F7D4B),
                        ),
                        label: Text(
                          house.title,
                          style: TextStyle(
                            color: const Color(0xFF2F7D4B),
                            fontSize: isSmallScreen ? 13 : 14,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        backgroundColor: const Color(0xFFF8FAFC),
                        shape: RoundedRectangleBorder(
                          side: const BorderSide(color: Color(0xFF9DD3B2)),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        elevation: 0,
                        onPressed: () => _openApiHouseDetails(house),
                      ))
                  .toList(),
            ),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: () => _navigateToAddHouseOwner(owner),
                icon: const Icon(Icons.add_home_work_outlined, size: 18),
                label: const Text('Add House'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildApiOwnersTab() {
    return FutureBuilder<List<_ApiOwner>>(
      future: _apiOwnersFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting &&
            !snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          if (_looksLikeSessionExpired(snapshot.error)) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              _redirectToLoginAfterSessionExpiry();
            });
          }
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Text(
                'Erreur API: ${snapshot.error}',
                textAlign: TextAlign.center,
              ),
            ),
          );
        }
        final owners = snapshot.data ?? const <_ApiOwner>[];
        if (owners.isEmpty) {
          return const Center(
              child:
                  Text('Aucun proprietaire trouve dans la base du serveur.'));
        }
        return RefreshIndicator(
          onRefresh: () async => _refreshAllApiTabs(),
          child: ListView.builder(
            key: const PageStorageKey<String>('admin-owners-list'),
            padding: const EdgeInsets.fromLTRB(0, 8, 0, 24),
            itemCount: owners.length,
            itemBuilder: (context, index) => _buildApiOwnerCard(owners[index]),
          ),
        );
      },
    );
  }

  Widget _buildApprovalsTab() {
    return FutureBuilder<List<List<Map<String, dynamic>>>>(
      future: _approvalDataFuture,
      builder: (context, countsSnapshot) {
        if (countsSnapshot.connectionState == ConnectionState.waiting &&
            !countsSnapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        if (countsSnapshot.hasError) {
          if (_looksLikeSessionExpired(countsSnapshot.error)) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              _redirectToLoginAfterSessionExpiry();
            });
          }
          return Center(
              child: Text('Erreur demandes: ${countsSnapshot.error}'));
        }
        final pendingAll =
            countsSnapshot.data != null && countsSnapshot.data!.isNotEmpty
                ? countsSnapshot.data![0]
                : const <Map<String, dynamic>>[];
        final historyAll =
            countsSnapshot.data != null && countsSnapshot.data!.length > 1
                ? countsSnapshot.data![1]
                : const <Map<String, dynamic>>[];
        final pendingEffective = pendingAll.where((req) {
          final id = (req['id'] ?? '').toString().trim();
          return id.isEmpty || !_processedApprovalIds.contains(id);
        }).toList();
        final mergedHistory = <Map<String, dynamic>>[
          ...historyAll,
        ];
        for (final entry in _localApprovalPayloads.entries) {
          if (mergedHistory
              .any((row) => (row['id'] ?? '').toString() == entry.key)) {
            continue;
          }
          mergedHistory.insert(0, entry.value);
        }
        final pendingCount = pendingEffective.length;
        final historyCount = mergedHistory.length;

        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
              child: Row(
                children: [
                  ChoiceChip(
                    label: Text('En attente ($pendingCount)'),
                    selected: _approvalTabFilter == _ApprovalTabFilter.pending,
                    onSelected: (_) => setState(() {
                      _approvalTabFilter = _ApprovalTabFilter.pending;
                    }),
                  ),
                  const SizedBox(width: 8),
                  ChoiceChip(
                    label: Text('Traitees ($historyCount)'),
                    selected: _approvalTabFilter == _ApprovalTabFilter.history,
                    onSelected: (_) => setState(() {
                      _approvalTabFilter = _ApprovalTabFilter.history;
                    }),
                  ),
                ],
              ),
            ),
            Expanded(
              child: Builder(
                builder: (context) {
                  var requests =
                      _approvalTabFilter == _ApprovalTabFilter.pending
                          ? pendingAll
                          : mergedHistory;
                  if (_approvalTabFilter == _ApprovalTabFilter.pending) {
                    requests = requests.where((req) {
                      final id = (req['id'] ?? '').toString().trim();
                      return id.isEmpty || !_processedApprovalIds.contains(id);
                    }).toList();
                  }

                  if (requests.isEmpty) {
                    return Center(
                      child: Text(
                        _approvalTabFilter == _ApprovalTabFilter.pending
                            ? 'Aucune demande calendrier en attente.'
                            : 'Aucune demande traitee.',
                      ),
                    );
                  }

                  return ListView.separated(
                    key: const PageStorageKey<String>('admin-approvals-list'),
                    padding: const EdgeInsets.all(12),
                    itemCount: requests.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (context, index) {
                      final req = requests[index];
                      final metadata = (req['metadata'] is Map)
                          ? Map<String, dynamic>.from(req['metadata'] as Map)
                          : <String, dynamic>{};

                      final ownerId =
                          (metadata['ownerId'] ?? req['clientUserId'] ?? '')
                              .toString();
                      final propertyTitle = (metadata['propertyTitle'] ??
                              req['propertyTitle'] ??
                              '')
                          .toString();
                      final startDate =
                          (metadata['startDate'] ?? '').toString();
                      final endDate = (metadata['endDate'] ?? '').toString();
                      final note = (metadata['note'] ?? '').toString();
                      final status = (metadata['status'] ?? 'pending')
                          .toString()
                          .toLowerCase();

                      return Card(
                        child: Padding(
                          padding: const EdgeInsets.all(12),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                propertyTitle.isEmpty
                                    ? 'Demande calendrier'
                                    : propertyTitle,
                                style: const TextStyle(
                                    fontSize: 18, fontWeight: FontWeight.w700),
                              ),
                              const SizedBox(height: 6),
                              Text('Owner ID: $ownerId'),
                              Text('Plage: $startDate -> $endDate'),
                              if (note.isNotEmpty) ...[
                                const SizedBox(height: 6),
                                Text('Note: $note'),
                              ],
                              if (_approvalTabFilter ==
                                  _ApprovalTabFilter.history) ...[
                                const SizedBox(height: 6),
                                Text(
                                    'Statut: ${status == 'approved' ? 'Approuvee' : 'Rejetee'}'),
                              ],
                              if (_approvalTabFilter ==
                                  _ApprovalTabFilter.pending) ...[
                                const SizedBox(height: 10),
                                Row(
                                  children: [
                                    Expanded(
                                      child: ElevatedButton.icon(
                                        onPressed: () =>
                                            _approveCalendarRequest(req),
                                        icon: const Icon(
                                            Icons.check_circle_outline),
                                        label: const Text('Approve'),
                                        style: ElevatedButton.styleFrom(
                                          backgroundColor:
                                              const Color(0xFF2F7D4B),
                                          foregroundColor: Colors.white,
                                        ),
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: OutlinedButton.icon(
                                        onPressed: () =>
                                            _rejectCalendarRequest(req),
                                        icon: const Icon(Icons.close),
                                        label: const Text('Reject'),
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ],
                          ),
                        ),
                      );
                    },
                  );
                },
              ),
            ),
          ],
        );
      },
    );
  }

  String _formatDateTimeLabel(String value) {
    final clean = value.trim();
    final localMatch = RegExp(
      r'^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?$',
    ).firstMatch(clean);
    if (localMatch != null) {
      return '${localMatch.group(3)}/${localMatch.group(2)} ${localMatch.group(4)}:${localMatch.group(5)}';
    }
    final parsed = DateTime.tryParse(clean);
    if (parsed == null) return clean;
    final local = parsed.toLocal();
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(local.day)}/${two(local.month)} ${two(local.hour)}:${two(local.minute)}';
  }

  String _truncateLabel(String value, {int max = 42}) {
    final clean = value.trim();
    if (clean.length <= max) return clean;
    return '${clean.substring(0, max - 1)}…';
  }

  String _notificationCategory(Map<String, dynamic> notif) {
    final explicit = (notif['category'] ?? '').toString().toLowerCase();
    if (explicit == 'owner' || explicit == 'client') return explicit;

    final message = (notif['message'] ?? '').toString().toLowerCase();
    if (message.contains('reservation') || message.contains('client')) {
      return 'client';
    }
    return 'owner';
  }

  Widget _notificationCard(Map<String, dynamic> notif) {
    final category = _notificationCategory(notif);
    final message = (notif['message'] ?? '').toString();
    final type = (notif['type'] ?? '').toString().toLowerCase();
    final isRead = notif['lu'] == true;
    final created =
        _formatDateTimeLabel((notif['created_at'] ?? '').toString());

    final icon = category == 'client'
        ? Icons.event_available_outlined
        : Icons.support_agent_outlined;
    final badgeLabel =
        category == 'client' ? 'Reservation client' : 'Proprietaire';
    final badgeColor = category == 'client'
        ? const Color(0xFF0EA5E9)
        : const Color(0xFF2F7D4B);
    final typeText = type.isEmpty ? 'info' : type;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isRead ? Colors.white : const Color(0xFFF8FAFF),
        border: Border.all(
          color: isRead ? const Color(0xFFE5E7EB) : badgeColor,
          width: isRead ? 1 : 1.4,
        ),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 18, color: badgeColor),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  message.isEmpty ? 'Notification' : message,
                  maxLines: 4,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Color(0xFF111827),
                    fontWeight: FontWeight.w600,
                    height: 1.2,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: badgeColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  badgeLabel,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: badgeColor,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                typeText.toUpperCase(),
                style: const TextStyle(
                  fontSize: 11,
                  color: Color(0xFF6B7280),
                  fontWeight: FontWeight.w700,
                ),
              ),
              const Spacer(),
              Text(
                created,
                style: const TextStyle(fontSize: 11, color: Color(0xFF6B7280)),
              ),
            ],
          ),
          if (!isRead) ...[
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: () => _markAdminNotificationRead(notif),
                icon: const Icon(Icons.done, size: 16),
                label: const Text('Marquer lu'),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _markAdminNotificationRead(Map<String, dynamic> notif) async {
    final id = (notif['id'] ?? '').toString().trim();
    if (id.isEmpty) return;
    try {
      if ((notif['source'] ?? '').toString() == 'client_interactions') {
        await _api.markClientInteractionNotificationRead(id);
      } else {
        await _api.markAdminNotificationRead(id);
      }
      _refreshAllApiTabs();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Echec mise a jour notification: $error')),
      );
    }
  }

  Widget _buildNotificationBellIcon() {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Icon(
          Icons.notifications_none,
          color: _adminUnreadNotifications > 0
              ? const Color(0xFFDC2626)
              : const Color(0xFF2F7D4B),
        ),
        if (_adminUnreadNotifications > 0)
          Positioned(
            right: -8,
            top: -6,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
              decoration: const BoxDecoration(
                color: Color(0xFFDC2626),
                shape: BoxShape.rectangle,
                borderRadius: BorderRadius.all(Radius.circular(999)),
              ),
              child: Text(
                _adminUnreadNotifications > 99
                    ? '99+'
                    : '$_adminUnreadNotifications',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildChatTab() {
    return FutureBuilder<List<_ApiOwner>>(
      future: _apiOwnersFuture,
      builder: (context, ownersSnapshot) {
        final owners = ownersSnapshot.data ?? const <_ApiOwner>[];
        final hasSelectedOwner =
            owners.any((owner) => owner.id == _selectedChatOwnerId);
        final selectedOwnerId = hasSelectedOwner ? _selectedChatOwnerId : null;
        final selectedOwner =
            owners.where((o) => o.id == selectedOwnerId).firstOrNull;
        final ownerHouses = selectedOwner?.houses ?? const <_ApiHouse>[];
        final hasSelectedBien =
            ownerHouses.any((house) => house.id == _selectedChatBienId);
        final selectedBienId = hasSelectedBien ? _selectedChatBienId : null;
        final selectedHouseTitle = ownerHouses
            .where((house) => house.id == selectedBienId)
            .map((house) => house.title)
            .firstOrNull;

        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  DropdownButtonFormField<String>(
                    initialValue: selectedOwnerId,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'Owner',
                      border: OutlineInputBorder(),
                    ),
                    items: owners
                        .map(
                          (owner) => DropdownMenuItem<String>(
                            value: owner.id,
                            child: Text(
                              _truncateLabel('${owner.name} (${owner.id})'),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        )
                        .toList(),
                    selectedItemBuilder: (_) => owners
                        .map(
                          (owner) => Align(
                            alignment: Alignment.centerLeft,
                            child: Text(
                              _truncateLabel('${owner.name} (${owner.id})'),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        )
                        .toList(),
                    onChanged: (value) {
                      setState(() {
                        _selectedChatOwnerId = value;
                        _selectedChatBienId = null;
                        _selectedChatPropertyTitle = null;
                      });
                      _refreshChatThread();
                    },
                  ),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    initialValue: selectedBienId,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'Bien (optionnel)',
                      border: OutlineInputBorder(),
                    ),
                    items: ownerHouses
                        .map(
                          (house) => DropdownMenuItem<String>(
                            value: house.id,
                            child: Text(
                              _truncateLabel(house.title),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        )
                        .toList(),
                    selectedItemBuilder: (_) => ownerHouses
                        .map(
                          (house) => Align(
                            alignment: Alignment.centerLeft,
                            child: Text(
                              _truncateLabel(house.title),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        )
                        .toList(),
                    onChanged: (value) {
                      setState(() {
                        _selectedChatBienId = value;
                        _selectedChatPropertyTitle = ownerHouses
                            .where((house) => house.id == value)
                            .map((house) => house.title)
                            .firstOrNull;
                      });
                      _refreshChatThread();
                    },
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _chatMessageController,
                          decoration: const InputDecoration(
                            hintText: 'Ecrire un message...',
                            border: OutlineInputBorder(),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      ElevatedButton(
                        onPressed:
                            _sendingAdminMessage || selectedOwnerId == null
                                ? null
                                : _sendAdminMessage,
                        child: _sendingAdminMessage
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child:
                                    CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Icon(Icons.send),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  if (selectedOwnerId != null)
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 8),
                      decoration: BoxDecoration(
                        color: const Color(0xFFEAF6EE),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        selectedHouseTitle == null
                            ? 'Discussion avec ${selectedOwner?.name ?? selectedOwnerId}'
                            : 'Discussion ${selectedOwner?.name ?? selectedOwnerId} • ${_truncateLabel(selectedHouseTitle, max: 36)}',
                        style: const TextStyle(
                          color: Color(0xFF166534),
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    )
                  else
                    const Text(
                      'Selectionnez un owner pour ouvrir la discussion.',
                      style: TextStyle(color: Color(0xFF6B7280), fontSize: 12),
                    ),
                  const SizedBox(height: 8),
                  const Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      'Chat enregistre et persistant (admin <-> proprietaire).',
                      style: TextStyle(color: Color(0xFF6B7280), fontSize: 12),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: _chatMessagesFuture == null
                  ? const Center(
                      child: Text(
                          'Selectionnez un proprietaire et un bien pour ouvrir la discussion.'),
                    )
                  : FutureBuilder<List<Map<String, dynamic>>>(
                      future: _chatMessagesFuture,
                      builder: (context, snapshot) {
                        if (snapshot.connectionState ==
                                ConnectionState.waiting &&
                            !snapshot.hasData) {
                          return const Center(
                              child: CircularProgressIndicator());
                        }
                        if (snapshot.hasError) {
                          if (_looksLikeSessionExpired(snapshot.error)) {
                            WidgetsBinding.instance.addPostFrameCallback((_) {
                              _redirectToLoginAfterSessionExpiry();
                            });
                          }
                          return Center(
                              child: Text('Erreur chat: ${snapshot.error}'));
                        }

                        final messages = (snapshot.data ??
                                const <Map<String, dynamic>>[])
                            .map((e) => Map<String, dynamic>.from(e))
                            .toList()
                          ..sort((a, b) => (a['createdAt'] ?? '')
                              .toString()
                              .compareTo((b['createdAt'] ?? '').toString()));
                        if (messages.isEmpty) {
                          return const Center(
                              child: Text('Aucun message chat.'));
                        }

                        return ListView.builder(
                          key: const PageStorageKey<String>('admin-chat-list'),
                          padding: const EdgeInsets.all(12),
                          itemCount: messages.length,
                          itemBuilder: (context, index) {
                            final msg = messages[index];
                            final kind = (msg['kind'] ?? '').toString();
                            final text = (msg['text'] ?? '').toString();
                            final dateTime = _formatDateTimeLabel(
                                (msg['createdAt'] ?? '').toString());
                            final fromAdmin = kind == 'admin_owner_chat';

                            return Align(
                              alignment: fromAdmin
                                  ? Alignment.centerRight
                                  : Alignment.centerLeft,
                              child: Container(
                                margin: const EdgeInsets.only(bottom: 8),
                                padding:
                                    const EdgeInsets.fromLTRB(12, 9, 12, 9),
                                constraints:
                                    const BoxConstraints(maxWidth: 330),
                                decoration: BoxDecoration(
                                  color: fromAdmin
                                      ? const Color(0xFFDCFCE7)
                                      : const Color(0xFFF3F4F6),
                                  border: Border.all(
                                    color: fromAdmin
                                        ? const Color(0xFF86EFAC)
                                        : const Color(0xFFE5E7EB),
                                  ),
                                  borderRadius: BorderRadius.only(
                                    topLeft: const Radius.circular(14),
                                    topRight: const Radius.circular(14),
                                    bottomLeft:
                                        Radius.circular(fromAdmin ? 14 : 4),
                                    bottomRight:
                                        Radius.circular(fromAdmin ? 4 : 14),
                                  ),
                                ),
                                child: Column(
                                  crossAxisAlignment: fromAdmin
                                      ? CrossAxisAlignment.end
                                      : CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      text.isEmpty ? '(vide)' : text,
                                      style: const TextStyle(
                                        fontSize: 14,
                                        color: Color(0xFF111827),
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      dateTime,
                                      style: const TextStyle(
                                          fontSize: 11,
                                          color: Color(0xFF6B7280)),
                                    ),
                                  ],
                                ),
                              ),
                            );
                          },
                        );
                      },
                    ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildNotificationsTab() {
    return FutureBuilder<List<List<Map<String, dynamic>>>>(
      future: _notificationsDataFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting &&
            !snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          if (_looksLikeSessionExpired(snapshot.error)) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              _redirectToLoginAfterSessionExpiry();
            });
          }
          return Center(child: Text('Erreur notifications: ${snapshot.error}'));
        }
        final merged = <Map<String, dynamic>>[];
        if (snapshot.data != null && snapshot.data!.isNotEmpty) {
          merged.addAll(snapshot.data![0]);
          merged.addAll(snapshot.data![1]);
        }
        merged.sort((a, b) => (b['created_at'] ?? '')
            .toString()
            .compareTo((a['created_at'] ?? '').toString()));

        final ownerNotifications =
            merged.where((n) => _notificationCategory(n) == 'owner').toList();
        final clientNotifications =
            merged.where((n) => _notificationCategory(n) == 'client').toList();
        final notifications =
            _notificationFilter == _AdminNotificationFilter.owner
                ? ownerNotifications
                : _notificationFilter == _AdminNotificationFilter.client
                    ? clientNotifications
                    : merged;
        if (notifications.isEmpty) {
          return const Center(
              child: Text('Aucune notification pour ce filtre.'));
        }

        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 2),
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  ChoiceChip(
                    label: Text('Tous (${merged.length})'),
                    selected:
                        _notificationFilter == _AdminNotificationFilter.all,
                    onSelected: (_) {
                      setState(() =>
                          _notificationFilter = _AdminNotificationFilter.all);
                    },
                  ),
                  ChoiceChip(
                    label: Text('Proprietaires (${ownerNotifications.length})'),
                    selected:
                        _notificationFilter == _AdminNotificationFilter.owner,
                    onSelected: (_) {
                      setState(() =>
                          _notificationFilter = _AdminNotificationFilter.owner);
                    },
                  ),
                  ChoiceChip(
                    label: Text(
                        'Reservations clients (${clientNotifications.length})'),
                    selected:
                        _notificationFilter == _AdminNotificationFilter.client,
                    onSelected: (_) {
                      setState(() => _notificationFilter =
                          _AdminNotificationFilter.client);
                    },
                  ),
                ],
              ),
            ),
            Expanded(
              child: ListView.builder(
                key: const PageStorageKey<String>('admin-notifications-list'),
                padding: const EdgeInsets.all(12),
                itemCount: notifications.length,
                itemBuilder: (context, index) {
                  final notif = notifications[index];
                  return _notificationCard(notif);
                },
              ),
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    if (AppConfig.useDwiraApi) {
      return DefaultTabController(
        length: 4,
        child: Scaffold(
          backgroundColor: const Color(0xFFF4F6F8),
          appBar: AppBar(
            backgroundColor: const Color(0xFFF4F6F8),
            elevation: 0,
            titleSpacing: 16,
            title: const Text(
              'Dashboard Admin',
              style: TextStyle(
                color: Color(0xFF111827),
                fontWeight: FontWeight.w700,
                fontSize: 24,
              ),
            ),
            actions: [
              IconButton(
                onPressed: _refreshAllApiTabs,
                icon: const Icon(Icons.refresh, color: Color(0xFF2F7D4B)),
              ),
              IconButton(
                onPressed: () => _logout(context),
                icon: const Icon(Icons.logout, color: Color(0xFF111827)),
              ),
              Padding(
                padding: const EdgeInsets.only(right: 10),
                child: ElevatedButton.icon(
                  onPressed: _navigateToCreateOwner,
                  icon: const Icon(Icons.person_add_alt_1, size: 18),
                  label: const Text('New Owner'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF2F7D4B),
                    foregroundColor: Colors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                ),
              ),
            ],
            bottom: TabBar(
              tabs: [
                const Tab(
                    icon: Icon(Icons.people_alt_outlined), text: 'Owners'),
                Tab(
                    icon: Icon(Icons.event_available_outlined),
                    text: 'Approvals'),
                const Tab(icon: Icon(Icons.chat_bubble_outline), text: 'Chat'),
                Tab(icon: _buildNotificationBellIcon(), text: 'Notifications'),
              ],
            ),
          ),
          body: TabBarView(
            children: [
              _buildApiOwnersTab(),
              _buildApprovalsTab(),
              _buildChatTab(),
              _buildNotificationsTab(),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Admin Dashboard (Firebase mode)'),
        actions: [
          IconButton(
            onPressed: () => _logout(context),
            icon: const Icon(Icons.logout),
          ),
          IconButton(
            onPressed: _navigateToCreateOwner,
            icon: const Icon(Icons.person_add_alt_1),
          ),
        ],
      ),
      body: StreamBuilder<List<Map<String, dynamic>>>(
        stream: _ownersWithHousesStream(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          final data = snapshot.data ?? const <Map<String, dynamic>>[];
          if (data.isEmpty) {
            return const Center(child: Text('No owners found.'));
          }
          return ListView.builder(
            itemCount: data.length,
            itemBuilder: (context, index) {
              final ownerData = data[index];
              final ownerDoc = ownerData['owner'] as DocumentSnapshot;
              final houses = ownerData['houses'] as List<DocumentSnapshot>;
              return Card(
                margin: const EdgeInsets.all(10),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(ownerDoc['name']?.toString() ?? 'No Name'),
                      Text(ownerDoc['phone']?.toString() ?? 'No Phone'),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        children: houses
                            .map(
                              (h) => ActionChip(
                                label: Text(h['name']?.toString() ?? 'House'),
                                onPressed: () async {
                                  await Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                      builder: (_) =>
                                          HouseDetailsScreen(house: h),
                                    ),
                                  );
                                },
                              ),
                            )
                            .toList(),
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}

class _ApiOwner {
  final String id;
  final String name;
  final String phone;
  final List<_ApiHouse> houses;

  const _ApiOwner({
    required this.id,
    required this.name,
    required this.phone,
    required this.houses,
  });
}

class _ApiHouse {
  final String id;
  final String title;

  const _ApiHouse({required this.id, required this.title});
}

class _ApiOwnerBuilder {
  final String id;
  final String name;
  final String phone;
  final List<_ApiHouse> houses = [];

  _ApiOwnerBuilder({
    required this.id,
    required this.name,
    required this.phone,
  });
}

enum _AdminNotificationFilter { all, owner, client }

enum _ApprovalTabFilter { pending, history }
