import 'dart:async';
import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../config/app_config.dart';
import '../models/owner_house.dart';
import '../services/dwira_api_service.dart';
import '../services/houses_repository.dart';
import '../services/push_notification_service.dart';
import '../services/session_storage.dart';
import '../services/ui_language_service.dart';
import '../widgets/app_cached_image.dart';
import 'api_house_details_screen.dart';
import 'house_details.dart';
import 'login_screen.dart';

class OwnerHomeScreen extends StatefulWidget {
  final String? ownerId;

  const OwnerHomeScreen({super.key, this.ownerId});

  @override
  State<OwnerHomeScreen> createState() => _OwnerHomeScreenState();
}

class _OwnerHomeScreenState extends State<OwnerHomeScreen> {
  final HousesRepository _housesRepository = const HousesRepository();
  final DwiraApiService _api = DwiraApiService.instance;
  final TextEditingController _chatController = TextEditingController();
  final AudioPlayer _ringPlayer = AudioPlayer();

  Future<List<Map<String, dynamic>>>? _ownerChatFuture;
  Future<List<Map<String, dynamic>>>? _ownerNotificationsFuture;
  Future<List<OwnerHouse>>? _ownerHousesFuture;
  bool _sendingChat = false;
  Timer? _autoRefreshTimer;
  StreamSubscription<String>? _tokenRefreshSubscription;
  StreamSubscription<RemoteMessage>? _foregroundMessageSubscription;
  int _ownerUnreadNotifications = 0;
  int _pendingAvailabilityCount = 0;
  bool _showingAvailabilityDialog = false;
  bool _showingCalendarPromptDialog = false;
  bool _calendarPromptFlowInProgress = false;
  String? _lastAvailabilityNotifiedDemandId;
  bool _availabilityRinging = false;
  bool _registeringPushToken = false;
  int _consecutiveEmptyAvailabilityPolls = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(_lifecycleObserver);
    _ownerHousesFuture = _loadOwnerHouses();
    _refreshComms();
    _initPushNotifications();
    _startAutoRefresh();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(_lifecycleObserver);
    _autoRefreshTimer?.cancel();
    _tokenRefreshSubscription?.cancel();
    _foregroundMessageSubscription?.cancel();
    _stopAvailabilityRingtone();
    PushNotificationService.instance.stopAvailabilityAlarm();
    _ringPlayer.dispose();
    _chatController.dispose();
    super.dispose();
  }

  late final WidgetsBindingObserver _lifecycleObserver =
      _OwnerLifecycleObserver(
    onResumed: () {
      _refreshComms();
      _initPushNotifications();
    },
  );

  String get _resolvedOwnerId => (widget.ownerId ?? '').trim();
  String t(String key) => UiLanguageService.t(key);

  Future<void> _refreshComms() async {
    if (_resolvedOwnerId.isEmpty) return;
    final notificationsFuture = _api.fetchOwnerNotifications(_resolvedOwnerId);
    final chatFuture = _api.fetchOwnerChatMessages(_resolvedOwnerId);
    setState(() {
      _ownerChatFuture = chatFuture;
      _ownerNotificationsFuture = notificationsFuture;
    });

    notificationsFuture.then((items) {
      if (!mounted) return;
      setState(() {
        _ownerUnreadNotifications = items.where((n) => n['lu'] != true).length;
      });
    }).catchError((_) {});

    await _checkAvailabilityRequests();
    await _checkPendingCalendarPrompt();
  }

  Future<List<OwnerHouse>> _getOwnerHouses() async {
    if (_resolvedOwnerId.isEmpty) return [];
    return _housesRepository.getOwnerHouses(_resolvedOwnerId);
  }

  Future<List<OwnerHouse>> _loadOwnerHouses() async {
    final houses = await _getOwnerHouses();
    if (mounted) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        _warmHouseImageCache(houses);
      });
    }
    return houses;
  }

  Future<void> _warmHouseImageCache(List<OwnerHouse> houses) async {
    for (final house in houses) {
      if (!mounted) return;
      final rawUrl = (house.raw['cover_media_url'] ??
              house.raw['cover_url'] ??
              house.raw['image_url'] ??
              house.raw['photo_url'] ??
              '')
          .toString()
          .trim();
      final mediaUrl = _resolveMediaUrl(rawUrl);
      if (mediaUrl.isEmpty) continue;
      try {
        await precacheImage(CachedNetworkImageProvider(mediaUrl), context);
      } catch (_) {
        // Visible widget fallback handles failures.
      }
    }
  }

  void _startAutoRefresh() {
    _autoRefreshTimer?.cancel();
    _autoRefreshTimer = Timer.periodic(const Duration(seconds: 8), (_) {
      if (!mounted) return;
      _refreshComms();
    });
  }

  Future<void> _initPushNotifications() async {
    if (_resolvedOwnerId.isEmpty || _registeringPushToken) return;
    setState(() {
      _registeringPushToken = true;
    });
    try {
      final push = PushNotificationService.instance;
      final permission = await push.requestPermission();
      if (permission.authorizationStatus == AuthorizationStatus.denied) {
        return;
      }
      final token = (await push.getToken())?.trim() ?? '';
      if (token.isEmpty) {
        return;
      }
      await _registerPushToken(token);
      _tokenRefreshSubscription?.cancel();
      _tokenRefreshSubscription = push.onTokenRefresh.listen((nextToken) {
        _api
            .registerOwnerPushToken(
              ownerId: _resolvedOwnerId,
              token: nextToken,
              platform: kIsWeb ? 'web' : 'mobile',
            )
            .then((_) {})
            .catchError((_) {});
      });
      _foregroundMessageSubscription?.cancel();
      _foregroundMessageSubscription = push.onMessage.listen((_) {
        _refreshComms();
      });
    } catch (_) {
    } finally {
      if (mounted) {
        setState(() {
          _registeringPushToken = false;
        });
      }
    }
  }

  Future<void> _registerPushToken(String token) async {
    await _api.registerOwnerPushToken(
      ownerId: _resolvedOwnerId,
      token: token,
      platform: kIsWeb ? 'web' : 'mobile',
    );
  }

  Future<void> _checkAvailabilityRequests() async {
    if (_resolvedOwnerId.isEmpty) return;
    try {
      final requests =
          await _api.fetchOwnerAvailabilityRequests(_resolvedOwnerId);
      if (!mounted) return;
      setState(() {
        _pendingAvailabilityCount = requests.length;
      });
      if (requests.isNotEmpty) {
        _consecutiveEmptyAvailabilityPolls = 0;
        await _startAvailabilityRingtone();
        final firstRequest = Map<String, dynamic>.from(requests.first);
        final demandId = (firstRequest['id'] ?? '').toString().trim();
        if (demandId.isNotEmpty &&
            demandId != _lastAvailabilityNotifiedDemandId) {
          _lastAvailabilityNotifiedDemandId = demandId;
          final title = 'Demande de disponibilite';
          final propertyTitle = (firstRequest['bien_titre'] ??
                  firstRequest['bien_reference'] ??
                  'Bien')
              .toString()
              .trim();
          final startDate =
              (firstRequest['start_date'] ?? '').toString().trim();
          final endDate = (firstRequest['end_date'] ?? '').toString().trim();
          final body =
              'Confirmez la disponibilite de $propertyTitle pour $startDate -> $endDate';
          await PushNotificationService.instance
              .showAvailabilityRequestNotification(
            notificationId: demandId,
            title: title,
            body: body,
          );
        }
      } else {
        _consecutiveEmptyAvailabilityPolls += 1;
        if (_consecutiveEmptyAvailabilityPolls >= 3) {
          _lastAvailabilityNotifiedDemandId = null;
          await _stopAvailabilityRingtone();
          await PushNotificationService.instance.stopAvailabilityAlarm();
        }
      }
      if (requests.isNotEmpty && !_showingAvailabilityDialog) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted || _showingAvailabilityDialog) return;
          _showAvailabilityDialog(Map<String, dynamic>.from(requests.first));
        });
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _pendingAvailabilityCount = 0;
      });
      // Keep ringing on transient network failures; stop only after a confirmed
      // availability response flow or repeated empty polls.
    }
  }

  Future<void> _checkPendingCalendarPrompt() async {
    if (_resolvedOwnerId.isEmpty ||
        _showingAvailabilityDialog ||
        _showingCalendarPromptDialog ||
        _calendarPromptFlowInProgress) {
      return;
    }
    try {
      final prompt =
          await _api.fetchPendingOwnerCalendarPrompt(_resolvedOwnerId);
      if (!mounted || prompt == null || _pendingAvailabilityCount > 0) return;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted ||
            _showingAvailabilityDialog ||
            _showingCalendarPromptDialog ||
            _calendarPromptFlowInProgress) {
          return;
        }
        _showCalendarPromptDialog(prompt);
      });
    } catch (_) {
      // Silent polling failure: notifications tab still shows server state.
    }
  }

  Future<void> _startAvailabilityRingtone() async {
    if (_availabilityRinging) return;
    _availabilityRinging = true;
    await _ringPlayer.setReleaseMode(ReleaseMode.loop);
    await _ringPlayer.setVolume(1.0);
    await _ringPlayer.play(AssetSource('audio/availability_request.wav'));
  }

  Future<void> _stopAvailabilityRingtone() async {
    if (!_availabilityRinging) return;
    _availabilityRinging = false;
    await _ringPlayer.stop();
  }

  void _showAvailabilityDialog(Map<String, dynamic> request) {
    if (!mounted) return;
    _showingAvailabilityDialog = true;
    final demandId = (request['id'] ?? '').toString().trim();
    final title = (request['bien_titre'] ?? request['bien_reference'] ?? 'Bien')
        .toString()
        .trim();
    final startDate = (request['start_date'] ?? '').toString();
    final endDate = (request['end_date'] ?? '').toString();
    final guests = (request['guests'] ?? '').toString();
    final coverUrl =
        _resolveMediaUrl((request['cover_media_url'] ?? '').toString());

    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: const Text('Confirmer disponibilite'),
        content: SizedBox(
          width: 420,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: SizedBox(
                  height: 160,
                  width: double.infinity,
                  child: coverUrl.isEmpty
                      ? Container(
                          color: const Color(0xFFEAF6EE),
                          alignment: Alignment.center,
                          child: const Icon(Icons.home_work_outlined, size: 56),
                        )
                      : AppCachedImage(
                          imageUrl: coverUrl,
                          fit: BoxFit.cover,
                          placeholder: Container(
                            color: const Color(0xFFEAF6EE),
                            alignment: Alignment.center,
                            child:
                                const Icon(Icons.home_work_outlined, size: 56),
                          ),
                          errorWidget: Container(
                            color: const Color(0xFFEAF6EE),
                            alignment: Alignment.center,
                            child:
                                const Icon(Icons.home_work_outlined, size: 56),
                          ),
                        ),
                ),
              ),
              const SizedBox(height: 12),
              Text(
                title.isEmpty ? 'Bien' : title,
                style:
                    const TextStyle(fontWeight: FontWeight.w700, fontSize: 18),
              ),
              const SizedBox(height: 6),
              Text('Periode: $startDate -> $endDate'),
              Text('Voyageurs: ${guests.isEmpty ? '-' : guests}'),
              const SizedBox(height: 8),
              const Text(
                'Ce bien est-il disponible pour cette periode ?',
                style: TextStyle(color: Color(0xFF4B5563)),
              ),
            ],
          ),
        ),
        actions: [
          OutlinedButton(
            onPressed: () async {
              try {
                await _stopAvailabilityRingtone();
                await PushNotificationService.instance.stopAvailabilityAlarm();
                await _api.respondOwnerAvailabilityRequest(
                  ownerId: _resolvedOwnerId,
                  demandId: demandId,
                  available: false,
                );
                if (!mounted) return;
                Navigator.of(this.context).pop();
                ScaffoldMessenger.of(this.context).showSnackBar(
                  const SnackBar(
                      content: Text('Reponse envoyee: non disponible')),
                );
                await _refreshComms();
              } catch (e) {
                if (!mounted) return;
                ScaffoldMessenger.of(this.context).showSnackBar(
                  SnackBar(content: Text('Erreur envoi reponse: $e')),
                );
              } finally {
                _showingAvailabilityDialog = false;
              }
            },
            child: const Text('Non disponible'),
          ),
          ElevatedButton(
            onPressed: () async {
              try {
                await _stopAvailabilityRingtone();
                await PushNotificationService.instance.stopAvailabilityAlarm();
                await _api.respondOwnerAvailabilityRequest(
                  ownerId: _resolvedOwnerId,
                  demandId: demandId,
                  available: true,
                );
                if (!mounted) return;
                Navigator.of(this.context).pop();
                ScaffoldMessenger.of(this.context).showSnackBar(
                  const SnackBar(content: Text('Reponse envoyee: disponible')),
                );
                await _refreshComms();
              } catch (e) {
                if (!mounted) return;
                ScaffoldMessenger.of(this.context).showSnackBar(
                  SnackBar(content: Text('Erreur envoi reponse: $e')),
                );
              } finally {
                _showingAvailabilityDialog = false;
              }
            },
            child: const Text('Oui disponible'),
          ),
        ],
      ),
    ).then((_) {
      _showingAvailabilityDialog = false;
    });
  }

  void _showCalendarPromptDialog(Map<String, dynamic> prompt) {
    if (!mounted) return;
    _showingCalendarPromptDialog = true;
    final promptId = (prompt['id'] ?? '').toString().trim();
    final promptDate = (prompt['promptDate'] ?? '').toString().trim();

    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: const Text('Mise a jour calendrier'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Vos calendriers sont a jour ?',
              style: TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 16,
              ),
            ),
            if (promptDate.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  'Relance du jour: $promptDate',
                  style: const TextStyle(color: Color(0xFF6B7280)),
                ),
              ),
          ],
        ),
        actions: [
          OutlinedButton(
            onPressed: () async {
              Navigator.of(this.context).pop();
              _showingCalendarPromptDialog = false;
              await _handleCalendarPromptNeedsUpdate(promptId);
            },
            child: const Text('Non'),
          ),
          ElevatedButton(
            onPressed: () async {
              try {
                await _api.respondOwnerCalendarPrompt(
                  ownerId: _resolvedOwnerId,
                  promptId: promptId,
                  responseKind: 'up_to_date',
                );
                if (!mounted) return;
                Navigator.of(this.context).pop();
                ScaffoldMessenger.of(this.context).showSnackBar(
                  const SnackBar(
                    content: Text('Reponse envoyee: calendriers a jour'),
                  ),
                );
                await _refreshComms();
              } catch (e) {
                if (!mounted) return;
                ScaffoldMessenger.of(this.context).showSnackBar(
                  SnackBar(content: Text('Erreur envoi reponse: $e')),
                );
              } finally {
                _showingCalendarPromptDialog = false;
              }
            },
            child: const Text('Oui'),
          ),
        ],
      ),
    ).then((_) {
      _showingCalendarPromptDialog = false;
    });
  }

  Future<void> _handleCalendarPromptNeedsUpdate(String promptId) async {
    if (!mounted) return;
    _calendarPromptFlowInProgress = true;
    try {
      final houses = await (_ownerHousesFuture ?? _getOwnerHouses());
      if (!mounted) return;
      if (houses.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text('Aucun bien disponible pour mise a jour.')),
        );
        return;
      }

      final selectedHouse = await showModalBottomSheet<OwnerHouse>(
        context: context,
        isScrollControlled: true,
        builder: (context) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Selectionnez un bien',
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 18,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Choisissez le bien dont le calendrier doit etre mis a jour.',
                  style: TextStyle(color: Color(0xFF6B7280)),
                ),
                const SizedBox(height: 14),
                Flexible(
                  child: ListView.separated(
                    shrinkWrap: true,
                    itemCount: houses.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (context, index) {
                      final house = houses[index];
                      return ListTile(
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                          side: const BorderSide(color: Color(0xFFE5E7EB)),
                        ),
                        tileColor: Colors.white,
                        title: Text(house.title),
                        subtitle: Text('ID: ${house.id}'),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => Navigator.of(context).pop(house),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        ),
      );

      if (!mounted || selectedHouse == null) return;

      final submitted = await Navigator.push<bool>(
        context,
        MaterialPageRoute(
          builder: (_) => ApiHouseDetailsScreen(
            house: selectedHouse,
            ownerId: _resolvedOwnerId,
            closeOnSuccessfulSubmit: true,
          ),
        ),
      );

      if (submitted == true) {
        await _api.respondOwnerCalendarPrompt(
          ownerId: _resolvedOwnerId,
          promptId: promptId,
          responseKind: 'update_requested',
          bienId: selectedHouse.id,
          propertyTitle: selectedHouse.title,
        );
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content:
                Text('Demande de mise a jour calendrier envoyee a l admin.'),
          ),
        );
        await _refreshComms();
      }
    } finally {
      _calendarPromptFlowInProgress = false;
    }
  }

  void _logout(BuildContext context) async {
    await PushNotificationService.instance.stopAvailabilityAlarm();
    await PersistedSession.clear();
    await FirebaseAuth.instance.signOut();
    if (!context.mounted) return;
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (route) => false,
    );
  }

  Future<void> _openHouseDetails(BuildContext context, OwnerHouse house) async {
    if (house.source == 'dwira_api') {
      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => ApiHouseDetailsScreen(
            house: house,
            ownerId: _resolvedOwnerId,
          ),
        ),
      );
      setState(() {});
      return;
    }

    try {
      final doc = await FirebaseFirestore.instance
          .collection('houses')
          .doc(house.id)
          .get();

      if (!doc.exists) {
        if (!context.mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Bien introuvable.')),
        );
        return;
      }

      if (!context.mounted) return;
      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) =>
              HouseDetailsScreen(house: doc, ownerId: _resolvedOwnerId),
        ),
      );
      setState(() {});
    } catch (_) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Impossible d ouvrir le detail du bien.')),
      );
    }
  }

  Future<void> _sendChat() async {
    final text = _chatController.text.trim();
    if (text.isEmpty || _resolvedOwnerId.isEmpty) return;

    setState(() => _sendingChat = true);
    try {
      await _api.sendOwnerChatMessage(ownerId: _resolvedOwnerId, text: text);
      _chatController.clear();
      _refreshComms();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Message envoye a l admin.')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Echec envoi message: $e')),
      );
    } finally {
      if (mounted) setState(() => _sendingChat = false);
    }
  }

  void _showOwnerQr() {
    if (_resolvedOwnerId.isEmpty) return;
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('QR Proprietaire'),
        content: SizedBox(
          width: 240,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              QrImageView(data: _resolvedOwnerId, size: 190),
              const SizedBox(height: 10),
              Text(
                'ID: $_resolvedOwnerId',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 12),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _localeName() => UiLanguageService.localeName();

  String _formatOwnerNotificationDate(DateTime date) {
    return DateFormat('dd MMM yyyy', _localeName()).format(date);
  }

  List<DateTime> _extractNotificationDates(String rawMessage) {
    final results = <DateTime>[];
    final seen = <String>{};

    for (final match
        in RegExp(r'\b\d{4}-\d{2}-\d{2}\b').allMatches(rawMessage)) {
      final parsed = DateTime.tryParse(match.group(0)!);
      if (parsed == null) continue;
      final key = DateFormat('yyyy-MM-dd').format(parsed);
      if (seen.add(key)) {
        results.add(DateTime(parsed.year, parsed.month, parsed.day));
      }
    }

    for (final match in RegExp(
      r'(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+[A-Z][a-z]{2}\s+\d{1,2}\s+\d{4}',
    ).allMatches(rawMessage)) {
      try {
        final parsed =
            DateFormat('EEE MMM d yyyy', 'en_US').parseLoose(match.group(0)!);
        final key = DateFormat('yyyy-MM-dd').format(parsed);
        if (seen.add(key)) {
          results.add(DateTime(parsed.year, parsed.month, parsed.day));
        }
      } catch (_) {
        // Ignore invalid legacy date fragments.
      }
    }

    return results;
  }

  String _cleanOwnerNotificationTitle(String rawMessage) {
    final lower = rawMessage.toLowerCase();
    if (lower.contains('confirmez la disponibilite')) {
      return 'Confirmation de disponibilite';
    }
    if (lower.contains('votre reponse a ete envoyee')) {
      final status = lower.contains('indisponible')
          ? 'bien indisponible'
          : (lower.contains('disponible') ? 'bien disponible' : null);
      return status == null ? 'Reponse envoyee' : 'Reponse envoyee: $status';
    }

    return rawMessage
        .replaceAll(
          RegExp(
            r'(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+[A-Z][a-z]{2}\s+\d{1,2}\s+\d{4}\s+\d{2}:\d{2}:\d{2}\s+GMT[+-]\d{4}\s+\(GMT[^\)]*\)',
          ),
          '',
        )
        .replaceAll(RegExp(r'\b\d{4}-\d{2}-\d{2}\b'), '')
        .replaceAll(
          RegExp(r'\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\b'),
          '',
        )
        .replaceAll(RegExp(r'Type:\s*[^|]+(\|)?', caseSensitive: false), '')
        .replaceAll(RegExp(r'GMT[+-]\d{4}'), '')
        .replaceAll(RegExp(r'\(GMT[^)]*\)'), '')
        .replaceAll(RegExp(r'pour la periode', caseSensitive: false), '')
        .replaceAll('->', ' ')
        .replaceAll('\n', ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim()
        .replaceAll(RegExp(r'[:(,\-\s]+$'), '');
  }

  String? _buildOwnerNotificationDateLine(String rawMessage) {
    final dates = _extractNotificationDates(rawMessage);
    if (dates.isEmpty) return null;

    final start = _formatOwnerNotificationDate(dates.first);
    final end = _formatOwnerNotificationDate(
      dates.length > 1 ? dates[1] : dates.first,
    );
    switch (UiLanguageService.current.value) {
      case UiLanguage.en:
        return 'From $start to $end';
      case UiLanguage.ar:
        return 'من $start إلى $end';
      case UiLanguage.fr:
        return 'Du $start au $end';
    }
  }

  _OwnerNotificationViewData _describeOwnerNotification(
    Map<String, dynamic> notification,
  ) {
    final rawMessage = (notification['message'] ?? '').toString().trim();
    final title = _cleanOwnerNotificationTitle(rawMessage);
    return _OwnerNotificationViewData(
      title: title.isEmpty ? 'Notification' : title,
      dateLine: _buildOwnerNotificationDateLine(rawMessage),
    );
  }

  Widget _buildHouseImage(OwnerHouse house) {
    final base64 = (house.photoBase64 ?? '').trim();
    final rawUrl = (house.raw['cover_media_url'] ??
            house.raw['cover_url'] ??
            house.raw['image_url'] ??
            house.raw['photo_url'] ??
            '')
        .toString()
        .trim();
    final mediaUrl = _resolveMediaUrl(rawUrl);

    if (mediaUrl.isNotEmpty) {
      return AppCachedImage(
        imageUrl: mediaUrl,
        fit: BoxFit.cover,
        width: double.infinity,
        placeholder: Container(
          color: const Color(0xFFF0F5F1),
          child: const Center(
            child:
                Icon(Icons.home_work_outlined, size: 70, color: Colors.green),
          ),
        ),
        errorWidget: Container(
          color: const Color(0xFFF0F5F1),
          child: const Center(
            child:
                Icon(Icons.home_work_outlined, size: 70, color: Colors.green),
          ),
        ),
      );
    }

    if (base64.isNotEmpty) {
      try {
        final normalized =
            base64.contains(',') ? base64.split(',').last : base64;
        return Image.memory(
          base64Decode(normalized),
          fit: BoxFit.cover,
          width: double.infinity,
        );
      } catch (_) {
        // ignore malformed base64
      }
    }
    return Container(
      color: const Color(0xFFF0F5F1),
      child: const Center(
        child: Icon(Icons.home_work_outlined, size: 70, color: Colors.green),
      ),
    );
  }

  String _resolveMediaUrl(String value) {
    final normalized = value.trim();
    if (normalized.isEmpty) return '';
    if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
      return normalized;
    }
    if (normalized.startsWith('/')) {
      final base = AppConfig.dwiraApiBaseUrl.replaceAll(RegExp(r'/+$'), '');
      return '$base$normalized';
    }
    return normalized;
  }

  Widget _buildPropertiesTab() {
    return FutureBuilder<List<OwnerHouse>>(
      future: _ownerHousesFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Text(
                '${t('loading_error')}: ${snapshot.error}',
                textAlign: TextAlign.center,
              ),
            ),
          );
        }
        final houses = snapshot.data ?? const <OwnerHouse>[];
        if (houses.isEmpty) {
          return Center(child: Text(t('no_properties')));
        }

        return ListView.builder(
          key: const PageStorageKey<String>('owner-properties-list'),
          cacheExtent: 1800,
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 22),
          itemCount: houses.length,
          itemBuilder: (context, index) {
            final house = houses[index];
            return Card(
              margin: const EdgeInsets.only(bottom: 14),
              elevation: house.isFeatured ? 10 : 6,
              shadowColor: house.isFeatured
                  ? const Color(0x66E6BE6A)
                  : const Color(0x33000000),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(18),
                side: BorderSide(
                  color: house.isFeatured
                      ? const Color(0xFFE8C779)
                      : const Color(0xFFE2E8F0),
                  width: house.isFeatured ? 1.6 : 1,
                ),
              ),
              child: InkWell(
                onTap: () => _openHouseDetails(context, house),
                borderRadius: BorderRadius.circular(18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(
                      height: 200,
                      child: ClipRRect(
                        borderRadius: const BorderRadius.vertical(
                          top: Radius.circular(18),
                        ),
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            _buildHouseImage(house),
                            Container(
                              decoration: const BoxDecoration(
                                gradient: LinearGradient(
                                  begin: Alignment.topCenter,
                                  end: Alignment.bottomCenter,
                                  colors: [
                                    Color(0x11000000),
                                    Color(0x66000000)
                                  ],
                                ),
                              ),
                            ),
                            if (house.isFeatured)
                              Positioned(
                                top: 10,
                                right: 10,
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 10, vertical: 5),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFFDECC8),
                                    borderRadius: BorderRadius.circular(999),
                                  ),
                                  child: const Text(
                                    'Bien vedette',
                                    style: TextStyle(
                                      color: Color(0xFF9A6A00),
                                      fontSize: 12,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(
                                child: Text(
                                  house.title,
                                  style: const TextStyle(
                                    fontSize: 17,
                                    fontWeight: FontWeight.w800,
                                    color: Color(0xFF1F2937),
                                    height: 1.2,
                                  ),
                                ),
                              ),
                              if (house.hasPending)
                                const Padding(
                                  padding: EdgeInsets.only(left: 8),
                                  child: Icon(
                                    Icons.warning_amber_rounded,
                                    color: Colors.red,
                                  ),
                                ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Text(
                            '${t('id')}: ${house.id}',
                            style: TextStyle(
                              color: const Color(0xFF2F7D4B),
                              fontWeight: FontWeight.w600,
                              fontSize: 15,
                            ),
                          ),
                          const SizedBox(height: 10),
                          Row(
                            children: [
                              const Spacer(),
                              FilledButton.tonalIcon(
                                onPressed: () =>
                                    _openHouseDetails(context, house),
                                icon: const Icon(Icons.open_in_new, size: 16),
                                label: Text(t('open')),
                                style: FilledButton.styleFrom(
                                  backgroundColor: const Color(0xFFEAF6EE),
                                  foregroundColor: const Color(0xFF2F7D4B),
                                  textStyle: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                  ),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(999),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildChatTab() {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: Text(
              t('chat_admin'),
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
            ),
          ),
          const SizedBox(height: 6),
          Align(
            alignment: Alignment.centerLeft,
            child: Text(
              t('chat_hint'),
              style: const TextStyle(color: Color(0xFF6B7280)),
            ),
          ),
          const SizedBox(height: 12),
          Expanded(
            child: FutureBuilder<List<Map<String, dynamic>>>(
              future: _ownerChatFuture,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snapshot.hasError) {
                  return Center(child: Text('Erreur chat: ${snapshot.error}'));
                }
                final items = snapshot.data ?? const <Map<String, dynamic>>[];
                if (items.isEmpty) {
                  return Center(child: Text(t('chat_empty')));
                }
                return RefreshIndicator(
                  onRefresh: _refreshComms,
                  child: ListView.separated(
                    itemCount: items.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (context, index) {
                      final msg = items[index];
                      final kind = (msg['kind'] ?? '').toString();
                      final text = (msg['text'] ?? '').toString();
                      final createdAt = (msg['createdAt'] ?? '').toString();
                      final fromAdmin = kind == 'admin_owner_chat';
                      return Align(
                        alignment: fromAdmin
                            ? Alignment.centerLeft
                            : Alignment.centerRight,
                        child: Container(
                          constraints: const BoxConstraints(maxWidth: 360),
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: fromAdmin
                                ? const Color(0xFFF3F4F6)
                                : const Color(0xFFEAF6EE),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Column(
                            crossAxisAlignment: fromAdmin
                                ? CrossAxisAlignment.start
                                : CrossAxisAlignment.end,
                            children: [
                              Text(text),
                              const SizedBox(height: 4),
                              Text(
                                createdAt,
                                style: const TextStyle(
                                  fontSize: 11,
                                  color: Color(0xFF6B7280),
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _chatController,
                  decoration: InputDecoration(
                    hintText: t('chat_input'),
                    border: OutlineInputBorder(),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              ElevatedButton(
                onPressed: _sendingChat ? null : _sendChat,
                child: _sendingChat
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.send),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildNotificationsTab() {
    return FutureBuilder<List<Map<String, dynamic>>>(
      future: _ownerNotificationsFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return Center(child: Text('Erreur notifications: ${snapshot.error}'));
        }
        final items = snapshot.data ?? const <Map<String, dynamic>>[];
        return RefreshIndicator(
          onRefresh: () async {
            await _refreshComms();
          },
          child: ListView.separated(
            padding: const EdgeInsets.only(bottom: 16),
            itemCount: items.isEmpty ? 1 : items.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (context, index) {
              if (items.isEmpty) {
                return Padding(
                  padding: const EdgeInsets.fromLTRB(16, 24, 16, 0),
                  child: Center(child: Text(t('owner_notifications_empty'))),
                );
              }
              final n = items[index];
              final id = (n['id'] ?? '').toString();
              final isRead = n['lu'] == true;
              final view = _describeOwnerNotification(n);
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: const Color(0xFFE5E7EB)),
                    boxShadow: const [
                      BoxShadow(
                        color: Color(0x12000000),
                        blurRadius: 12,
                        offset: Offset(0, 6),
                      ),
                    ],
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          color: const Color(0xFFEAF6EE),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        alignment: Alignment.center,
                        child: Icon(
                          isRead
                              ? Icons.notifications_none_outlined
                              : Icons.notifications_active_outlined,
                          color: const Color(0xFF2F7D4B),
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              view.title,
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w700,
                                color: Color(0xFF14532D),
                                height: 1.28,
                              ),
                            ),
                            if ((view.dateLine ?? '').isNotEmpty) ...[
                              const SizedBox(height: 10),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 7,
                                ),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFF8FAFC),
                                  borderRadius: BorderRadius.circular(999),
                                ),
                                child: Text(
                                  view.dateLine!,
                                  style: const TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                    color: Color(0xFF475569),
                                  ),
                                ),
                              ),
                            ],
                            if (!isRead) ...[
                              const SizedBox(height: 12),
                              Align(
                                alignment: Alignment.centerLeft,
                                child: TextButton(
                                  onPressed: () async {
                                    await _api.markOwnerNotificationRead(
                                      ownerId: _resolvedOwnerId,
                                      notificationId: id,
                                    );
                                    await _refreshComms();
                                  },
                                  child: Text(t('mark_read')),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<UiLanguage>(
      valueListenable: UiLanguageService.current,
      builder: (context, language, _) => Directionality(
        textDirection: UiLanguageService.direction(language),
        child: DefaultTabController(
          length: 3,
          child: Scaffold(
            appBar: AppBar(
              title: Text(t('my_properties')),
              actions: [
                PopupMenuButton<UiLanguage>(
                  tooltip: 'Language',
                  icon: const Icon(Icons.language),
                  onSelected: (value) =>
                      UiLanguageService.current.value = value,
                  itemBuilder: (context) => [
                    PopupMenuItem(
                      value: UiLanguage.fr,
                      child: Text(t('lang_fr')),
                    ),
                    PopupMenuItem(
                      value: UiLanguage.en,
                      child: Text(t('lang_en')),
                    ),
                    PopupMenuItem(
                      value: UiLanguage.ar,
                      child: Text(t('lang_ar')),
                    ),
                  ],
                ),
                IconButton(
                  onPressed: _showOwnerQr,
                  icon: const Icon(Icons.qr_code_2),
                  tooltip: 'QR',
                ),
                IconButton(
                  onPressed: () => _logout(context),
                  icon: const Icon(Icons.logout),
                ),
              ],
              bottom: TabBar(
                tabs: [
                  Tab(
                    icon: const Icon(Icons.home_work_outlined),
                    text: t('tab_properties'),
                  ),
                  Tab(
                    icon: const Icon(Icons.chat_bubble_outline),
                    text: t('tab_chat'),
                  ),
                  Tab(
                    icon: Stack(
                      clipBehavior: Clip.none,
                      children: [
                        const Icon(Icons.notifications_outlined),
                        if (_ownerUnreadNotifications > 0 ||
                            _pendingAvailabilityCount > 0)
                          Positioned(
                            right: -6,
                            top: -6,
                            child: Container(
                              width: 10,
                              height: 10,
                              decoration: const BoxDecoration(
                                color: Colors.red,
                                shape: BoxShape.circle,
                              ),
                            ),
                          ),
                      ],
                    ),
                    text: t('tab_notifications'),
                  ),
                ],
              ),
            ),
            body: TabBarView(
              children: [
                _buildPropertiesTab(),
                _buildChatTab(),
                _buildNotificationsTab(),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _OwnerLifecycleObserver with WidgetsBindingObserver {
  _OwnerLifecycleObserver({required this.onResumed});

  final VoidCallback onResumed;

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      onResumed();
    }
  }
}

class _OwnerNotificationViewData {
  final String title;
  final String? dateLine;

  const _OwnerNotificationViewData({
    required this.title,
    required this.dateLine,
  });
}
