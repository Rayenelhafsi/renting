import 'dart:async';
import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../config/app_config.dart';
import '../models/owner_house.dart';
import '../services/dwira_api_service.dart';
import '../services/houses_repository.dart';
import '../services/ui_language_service.dart';
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

  Future<List<Map<String, dynamic>>>? _ownerChatFuture;
  Future<List<Map<String, dynamic>>>? _ownerNotificationsFuture;
  Future<List<OwnerHouse>>? _ownerHousesFuture;
  bool _sendingChat = false;
  Timer? _autoRefreshTimer;
  int _ownerUnreadNotifications = 0;
  int _pendingAvailabilityCount = 0;
  bool _showingAvailabilityDialog = false;

  @override
  void initState() {
    super.initState();
    _ownerHousesFuture = _getOwnerHouses();
    _refreshComms();
    _initPushNotifications();
    _startAutoRefresh();
  }

  @override
  void dispose() {
    _autoRefreshTimer?.cancel();
    _chatController.dispose();
    super.dispose();
  }

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
  }

  Future<List<OwnerHouse>> _getOwnerHouses() async {
    if (_resolvedOwnerId.isEmpty) return [];
    return _housesRepository.getOwnerHouses(_resolvedOwnerId);
  }

  void _startAutoRefresh() {
    _autoRefreshTimer?.cancel();
    _autoRefreshTimer = Timer.periodic(const Duration(seconds: 8), (_) {
      if (!mounted) return;
      _refreshComms();
    });
  }

  Future<void> _initPushNotifications() async {
    if (_resolvedOwnerId.isEmpty) return;
    try {
      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
      final token = await messaging.getToken();
      if (token != null && token.trim().isNotEmpty) {
        await _api.registerOwnerPushToken(
          ownerId: _resolvedOwnerId,
          token: token.trim(),
          platform: kIsWeb ? 'web' : 'mobile',
        );
      }
      messaging.onTokenRefresh.listen((nextToken) {
        _api
            .registerOwnerPushToken(
              ownerId: _resolvedOwnerId,
              token: nextToken,
              platform: kIsWeb ? 'web' : 'mobile',
            )
            .catchError((_) {});
      });
      FirebaseMessaging.onMessage.listen((_) {
        _refreshComms();
      });
    } catch (_) {
      // FCM optional in local/debug environments
    }
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
    }
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
                      : Image.network(
                          coverUrl,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => Container(
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

  void _logout(BuildContext context) async {
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

  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'cleaning':
      case 'assigned':
      case 'true':
      case '1':
        return Colors.green[500]!;
      case 'done':
        return Colors.green[800]!;
      case 'pending':
      case 'false':
      case '0':
        return Colors.orange[700]!;
      default:
        return Colors.blueGrey[600]!;
    }
  }

  IconData _getStatusIcon(String status) {
    switch (status.toLowerCase()) {
      case 'cleaning':
        return Icons.cleaning_services;
      case 'assigned':
        return Icons.assignment;
      case 'done':
        return Icons.check_circle;
      case 'pending':
        return Icons.pending;
      default:
        return Icons.help_outline;
    }
  }

  Widget _buildStatusBadge(String title, String status) {
    final bg = _getStatusColor(status).withValues(alpha: 0.14);
    final fg = _getStatusColor(status).withValues(alpha: 0.95);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: fg.withValues(alpha: 0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(_getStatusIcon(status), size: 13, color: fg),
          const SizedBox(width: 4),
          Text(
            '$title: $status',
            style: TextStyle(
              color: fg,
              fontSize: 12,
              fontWeight: FontWeight.w700,
              fontFamily: 'Roboto',
            ),
          ),
        ],
      ),
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
      return Image.network(
        mediaUrl,
        fit: BoxFit.cover,
        width: double.infinity,
        errorBuilder: (_, __, ___) => Container(
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
                                    fontFamily: 'Roboto',
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
                              fontFamily: 'Roboto',
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
                                    fontFamily: 'Roboto',
                                    fontWeight: FontWeight.w700,
                                  ),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(999),
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 11),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              _buildStatusBadge(t('maintenance_cleaning'),
                                  house.cleaningStatus),
                              _buildStatusBadge(t('maintenance_plumber'),
                                  house.plumberStatus),
                              _buildStatusBadge(t('maintenance_electrician'),
                                  house.electricianStatus),
                              _buildStatusBadge(t('maintenance_delivery'),
                                  house.foodDeliveryStatus),
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
        if (items.isEmpty) {
          return Center(child: Text(t('owner_notifications_empty')));
        }
        return RefreshIndicator(
          onRefresh: _refreshComms,
          child: ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: items.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (context, index) {
              final n = items[index];
              final id = (n['id'] ?? '').toString();
              final isRead = n['lu'] == true;
              return ListTile(
                tileColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                  side: const BorderSide(color: Color(0xFFE5E7EB)),
                ),
                title: Text((n['message'] ?? '').toString()),
                subtitle: Text(
                  'Type: ${(n['type'] ?? 'info').toString()} | ${(n['createdAt'] ?? '').toString()}',
                ),
                trailing: isRead
                    ? const Icon(Icons.done_all, color: Color(0xFF2F7D4B))
                    : TextButton(
                        onPressed: () async {
                          await _api.markOwnerNotificationRead(
                            ownerId: _resolvedOwnerId,
                            notificationId: id,
                          );
                          await _refreshComms();
                        },
                        child: Text(t('mark_read')),
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
