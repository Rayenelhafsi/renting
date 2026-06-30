import 'dart:async';
import 'dart:convert';

import 'package:audioplayers/audioplayers.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

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

class _OwnerHomeScreenState extends State<OwnerHomeScreen>
    with TickerProviderStateMixin {
  static const MethodChannel _availabilityAlarmChannel =
      MethodChannel('dwira/availability_alarm');

  final HousesRepository _housesRepository = const HousesRepository();
  final DwiraApiService _api = DwiraApiService.instance;
  final TextEditingController _chatController = TextEditingController();
  final ScrollController _chatScrollController = ScrollController();
  late final TabController _tabController;
  late final AnimationController _availabilityGlowController;
  late final Animation<double> _availabilityGlowAnimation;
  late final AudioPlayer _availabilityAudioPlayer;

  Future<List<Map<String, dynamic>>>? _ownerNotificationsFuture;
  Future<List<OwnerHouse>>? _ownerHousesFuture;
  List<Map<String, dynamic>> _ownerChatMessages =
      const <Map<String, dynamic>>[];
  bool _chatLoaded = false;
  bool _chatLoading = false;
  bool _sendingChat = false;
  Timer? _autoRefreshTimer;
  StreamSubscription<String>? _tokenRefreshSubscription;
  StreamSubscription<RemoteMessage>? _foregroundMessageSubscription;
  StreamSubscription<RemoteMessage>? _openedMessageSubscription;
  StreamSubscription<Map<String, dynamic>>?
      _openedLocalNotificationSubscription;
  int _ownerUnreadNotifications = 0;
  int _ownerUnreadChatCount = 0;
  int _pendingAvailabilityCount = 0;
  bool _showingAvailabilityDialog = false;
  bool _showingCalendarPromptDialog = false;
  bool _calendarPromptFlowInProgress = false;
  List<Map<String, dynamic>> _latestOwnerNotifications =
      const <Map<String, dynamic>>[];
  String? _lastAvailabilityNotifiedDemandId;
  String? _lastSeenAdminChatMessageId;
  String? _lastOpenedNotificationFingerprint;
  bool _availabilityRinging = false;
  bool _registeringPushToken = false;
  int _consecutiveEmptyAvailabilityPolls = 0;
  bool _pushRetryScheduled = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this)
      ..addListener(_handleTabChanged);
    _availabilityGlowController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat(reverse: true);
    _availabilityGlowAnimation = CurvedAnimation(
      parent: _availabilityGlowController,
      curve: Curves.easeInOut,
    );
    _availabilityAudioPlayer = AudioPlayer(playerId: 'availability_alarm');
    _availabilityAudioPlayer.setReleaseMode(ReleaseMode.loop);
    WidgetsBinding.instance.addObserver(_lifecycleObserver);
    _ownerHousesFuture = _loadOwnerHouses();
    _refreshComms(showChatLoader: true);
    _initPushNotifications();
    _startAutoRefresh();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(_lifecycleObserver);
    _autoRefreshTimer?.cancel();
    _tokenRefreshSubscription?.cancel();
    _foregroundMessageSubscription?.cancel();
    _openedMessageSubscription?.cancel();
    _openedLocalNotificationSubscription?.cancel();
    _tabController.removeListener(_handleTabChanged);
    _tabController.dispose();
    _availabilityGlowController.dispose();
    _stopAvailabilityRingtone();
    _availabilityAudioPlayer.dispose();
    PushNotificationService.instance.stopAvailabilityAlarm();
    _chatScrollController.dispose();
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

  void _showLanguageSheet() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => SafeArea(
        child: Container(
          margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          padding: const EdgeInsets.fromLTRB(18, 18, 18, 12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(28),
            boxShadow: const [
              BoxShadow(
                color: Color(0x18000000),
                blurRadius: 28,
                offset: Offset(0, 14),
              ),
            ],
          ),
          child: ValueListenableBuilder<UiLanguage>(
            valueListenable: UiLanguageService.current,
            builder: (context, currentLanguage, _) => Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Langue',
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF14532D),
                  ),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Choisissez votre langue preferee.',
                  style: TextStyle(color: Color(0xFF6B7280)),
                ),
                const SizedBox(height: 16),
                _buildLanguageTile(
                  code: 'AR',
                  label: t('lang_ar'),
                  selected: currentLanguage == UiLanguage.ar,
                  onTap: () {
                    UiLanguageService.current.value = UiLanguage.ar;
                    Navigator.of(context).pop();
                  },
                ),
                _buildLanguageTile(
                  code: 'FR',
                  label: t('lang_fr'),
                  selected: currentLanguage == UiLanguage.fr,
                  onTap: () {
                    UiLanguageService.current.value = UiLanguage.fr;
                    Navigator.of(context).pop();
                  },
                ),
                _buildLanguageTile(
                  code: 'EN',
                  label: t('lang_en'),
                  selected: currentLanguage == UiLanguage.en,
                  onTap: () {
                    UiLanguageService.current.value = UiLanguage.en;
                    Navigator.of(context).pop();
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildLanguageTile({
    required String code,
    required String label,
    required bool selected,
    required VoidCallback onTap,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: selected ? const Color(0xFFEAF6EE) : const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(18),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            child: Row(
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: selected ? const Color(0xFF14532D) : Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: selected
                          ? const Color(0xFF14532D)
                          : const Color(0xFFD7E4DB),
                    ),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    code,
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      color: selected ? Colors.white : const Color(0xFF14532D),
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Text(
                    label,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF111827),
                    ),
                  ),
                ),
                Icon(
                  selected
                      ? Icons.check_circle_rounded
                      : Icons.chevron_right_rounded,
                  color: selected
                      ? const Color(0xFF177245)
                      : const Color(0xFF94A3B8),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _refreshComms({bool showChatLoader = false}) async {
    if (_resolvedOwnerId.isEmpty) return;
    final notificationsFuture = _api.fetchOwnerNotifications(_resolvedOwnerId);
    final chatFuture = _api.fetchOwnerChatMessages(_resolvedOwnerId);
    if (mounted) {
      setState(() {
        _ownerNotificationsFuture = notificationsFuture;
        if (showChatLoader && !_chatLoaded) {
          _chatLoading = true;
        }
      });
    }

    notificationsFuture.then((items) {
      if (!mounted) return;
      final orderedItems = _sortOwnerNotifications(items);
      setState(() {
        _latestOwnerNotifications = orderedItems;
        _ownerUnreadNotifications =
            orderedItems.where((n) => n['lu'] != true).length;
      });
    }).catchError((_) {});

    chatFuture.then((items) {
      if (!mounted) return;
      final orderedMessages = _sortOwnerChatMessages(items);
      _updateUnreadChatState(orderedMessages);
      setState(() {
        _ownerChatMessages = orderedMessages;
        _chatLoaded = true;
        _chatLoading = false;
      });
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _ensureChatAtBottom();
      });
    }).catchError((_) {
      if (!mounted) return;
      setState(() {
        _chatLoaded = true;
        _chatLoading = false;
      });
    });

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
        debugPrint(
          'Owner push registration skipped: notification permission denied',
        );
        return;
      }
      final token = (await push.getToken())?.trim() ?? '';
      if (token.isEmpty) {
        debugPrint(
          'Owner push registration failed: empty FCM token for owner '
          '$_resolvedOwnerId on ${push.registeredPlatform}',
        );
        _schedulePushRegistrationRetry();
        return;
      }
      await _registerPushToken(token);
      _tokenRefreshSubscription?.cancel();
      _tokenRefreshSubscription = push.onTokenRefresh.listen((nextToken) {
        _api
            .registerOwnerPushToken(
              ownerId: _resolvedOwnerId,
              token: nextToken,
              platform: push.registeredPlatform,
            )
            .then((_) {})
            .catchError((_) {});
      });
      _foregroundMessageSubscription?.cancel();
      _foregroundMessageSubscription = push.onMessage.listen((message) {
        _handleForegroundOwnerMessage(message);
      });
      _openedMessageSubscription ??=
          FirebaseMessaging.onMessageOpenedApp.listen((message) {
        _handleOpenedOwnerMessage(message);
      });
      _openedLocalNotificationSubscription ??=
          push.onNotificationTap.listen(_handleOpenedOwnerLocalNotification);
      final initialMessage =
          await FirebaseMessaging.instance.getInitialMessage();
      if (initialMessage != null) {
        await _handleOpenedOwnerMessage(initialMessage);
      }
      final initialLocalPayload = push.takeLaunchNotificationPayload();
      if (initialLocalPayload != null) {
        await _handleOpenedOwnerLocalNotification(initialLocalPayload);
      }
    } catch (error, stackTrace) {
      debugPrint('Owner push registration error: $error');
      debugPrintStack(stackTrace: stackTrace);
      _schedulePushRegistrationRetry();
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
      platform: PushNotificationService.instance.registeredPlatform,
    );
  }

  void _schedulePushRegistrationRetry() {
    if (_pushRetryScheduled || !mounted) return;
    _pushRetryScheduled = true;
    Future<void>.delayed(const Duration(seconds: 10), () {
      _pushRetryScheduled = false;
      if (!mounted) return;
      _initPushNotifications();
    });
  }

  Future<void> _handleForegroundOwnerMessage(RemoteMessage message) async {
    await _refreshComms();
    if (!mounted) return;
    final kind = (message.data['kind'] ?? '').toString().trim();
    if (kind == 'reservation_availability_request') {
      if (_showingAvailabilityDialog) return;
      await _checkAvailabilityRequests();
      return;
    }
    if (kind == 'admin_owner_chat') {
      final interactionId =
          (message.data['interactionId'] ?? '').toString().trim();
      if (_tabController.index != 1) {
        setState(() {
          _ownerUnreadChatCount = 1;
        });
      }
      if (interactionId.isNotEmpty) {
        _lastSeenAdminChatMessageId = interactionId;
      }
      return;
    }
    if (kind == 'owner_app_update') {
      return;
    }
    if (kind == 'calendar_daily_check_prompt') {
      if (_showingCalendarPromptDialog ||
          _showingAvailabilityDialog ||
          _calendarPromptFlowInProgress) {
        return;
      }
      final prompt =
          await _api.fetchPendingOwnerCalendarPrompt(_resolvedOwnerId);
      if (!mounted || prompt == null) return;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted ||
            _showingCalendarPromptDialog ||
            _showingAvailabilityDialog ||
            _calendarPromptFlowInProgress) {
          return;
        }
        _showCalendarPromptDialog(prompt);
      });
    }
  }

  Future<void> _handleOpenedOwnerMessage(RemoteMessage message) async {
    final fingerprint = _notificationFingerprint(
      kind: (message.data['kind'] ?? '').toString(),
      messageId: message.messageId,
      requestId: (message.data['requestId'] ??
              message.data['notificationId'] ??
              message.data['demandId'] ??
              message.data['id'])
          .toString(),
      body:
          message.notification?.body ?? (message.data['body'] ?? '').toString(),
    );
    if (_isDuplicateOpenedNotification(fingerprint)) return;
    await _refreshComms();
    if (!mounted) return;
    final kind = (message.data['kind'] ?? '').toString().trim();
    if (kind == 'reservation_availability_request') {
      await _checkAvailabilityRequests();
      return;
    }
    if (kind == 'owner_app_update') {
      await _openOwnerAppUpdateLink(message.data);
      return;
    }
    if (kind == 'admin_owner_chat') {
      await _handleIncomingAdminChatMessage(message.data);
      return;
    }
    if (kind == 'calendar_daily_check_prompt') {
      final prompt =
          await _api.fetchPendingOwnerCalendarPrompt(_resolvedOwnerId);
      if (!mounted || prompt == null) return;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted ||
            _showingCalendarPromptDialog ||
            _showingAvailabilityDialog ||
            _calendarPromptFlowInProgress) {
          return;
        }
        _showCalendarPromptDialog(prompt);
      });
    }
  }

  Future<void> _handleOpenedOwnerLocalNotification(
    Map<String, dynamic> payload,
  ) async {
    final data = _normalizePayloadMap(payload['data']);
    final kind = (data['kind'] ?? payload['kind'] ?? '').toString().trim();
    final fingerprint = _notificationFingerprint(
      kind: kind,
      messageId: (payload['messageId'] ?? '').toString(),
      requestId: (data['requestId'] ??
              data['notificationId'] ??
              data['demandId'] ??
              data['id'])
          .toString(),
      body: (payload['body'] ?? '').toString(),
    );
    if (_isDuplicateOpenedNotification(fingerprint)) return;
    await _refreshComms();
    if (!mounted) return;
    if (kind == 'reservation_availability_request') {
      await _checkAvailabilityRequests();
      return;
    }
    if (kind == 'owner_app_update') {
      await _openOwnerAppUpdateLink(data);
      return;
    }
    if (kind == 'admin_owner_chat') {
      await _handleIncomingAdminChatMessage(data);
      return;
    }
    if (kind == 'calendar_daily_check_prompt') {
      final prompt =
          await _api.fetchPendingOwnerCalendarPrompt(_resolvedOwnerId);
      if (!mounted || prompt == null) return;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted ||
            _showingCalendarPromptDialog ||
            _showingAvailabilityDialog ||
            _calendarPromptFlowInProgress) {
          return;
        }
        _showCalendarPromptDialog(prompt);
      });
    }
  }

  bool _isDuplicateOpenedNotification(String fingerprint) {
    if (fingerprint.isEmpty) return false;
    if (_lastOpenedNotificationFingerprint == fingerprint) {
      return true;
    }
    _lastOpenedNotificationFingerprint = fingerprint;
    return false;
  }

  String _notificationFingerprint({
    required String kind,
    required String? messageId,
    required String? requestId,
    required String? body,
  }) {
    return [
      kind.trim(),
      (messageId ?? '').trim(),
      (requestId ?? '').trim(),
      (body ?? '').trim(),
    ].join('|');
  }

  Map<String, dynamic> _normalizePayloadMap(dynamic payload) {
    if (payload is Map<String, dynamic>) {
      return payload;
    }
    if (payload is Map) {
      return payload.map((key, value) => MapEntry(key.toString(), value));
    }
    return const <String, dynamic>{};
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
          final propertyTitle = _ownerPropertyName(firstRequest);
          final startDate =
              (firstRequest['start_date'] ?? '').toString().trim();
          final endDate = (firstRequest['end_date'] ?? '').toString().trim();
          final title = propertyTitle;
          final body = 'Disponibilite a confirmer du $startDate au $endDate';
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
      if (_hasUnreadPriorityNotifications()) return;
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
    try {
      if (defaultTargetPlatform == TargetPlatform.iOS) {
        try {
          final started =
              await _availabilityAlarmChannel.invokeMethod<bool>('start');
          if (started == true) return;
        } catch (_) {
          // Fall back to the Flutter audio player if the native channel is
          // not ready yet.
        }
      }
      await _availabilityAudioPlayer.stop();
      await _availabilityAudioPlayer.setReleaseMode(ReleaseMode.loop);
      await _availabilityAudioPlayer.play(
        AssetSource('audio/availability_request.wav'),
        volume: 1.0,
      );
    } catch (_) {
      _availabilityRinging = false;
    }
  }

  Future<void> _stopAvailabilityRingtone() async {
    if (!_availabilityRinging) return;
    _availabilityRinging = false;
    if (defaultTargetPlatform == TargetPlatform.iOS) {
      try {
        await _availabilityAlarmChannel.invokeMethod<void>('stop');
      } catch (_) {
        // The fallback player is stopped below.
      }
    }
    await _availabilityAudioPlayer.stop();
  }

  void _handleTabChanged() {
    if (_tabController.indexIsChanging) return;
    if (_tabController.index == 1 && _ownerUnreadChatCount != 0) {
      setState(() {
        _ownerUnreadChatCount = 0;
      });
    }
    if (_tabController.index == 1) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _ensureChatAtBottom();
      });
    }
  }

  Future<void> _handleIncomingAdminChatMessage(
    Map<String, dynamic> data,
  ) async {
    await _refreshComms();
    if (!mounted) return;
    final interactionId = (data['interactionId'] ?? '').toString().trim();
    if (interactionId.isNotEmpty) {
      _lastSeenAdminChatMessageId = interactionId;
    }
    _openChatTab(markAsRead: true);
  }

  void _openChatTab({bool markAsRead = false}) {
    if (_tabController.index != 1) {
      _tabController.animateTo(1);
    }
    if (markAsRead && _ownerUnreadChatCount != 0) {
      setState(() {
        _ownerUnreadChatCount = 0;
      });
    }
  }

  void _updateUnreadChatState(List<Map<String, dynamic>> items) {
    String? latestAdminMessageId;
    for (final item in items.reversed) {
      final kind = (item['kind'] ?? '').toString().trim();
      if (kind != 'admin_owner_chat') continue;
      latestAdminMessageId = (item['id'] ?? '').toString().trim();
      if (latestAdminMessageId.isNotEmpty) {
        break;
      }
    }
    if (latestAdminMessageId == null || latestAdminMessageId.isEmpty) return;
    final hadSeenMessage = _lastSeenAdminChatMessageId != null;
    final isNewAdminMessage =
        latestAdminMessageId != _lastSeenAdminChatMessageId;
    _lastSeenAdminChatMessageId = latestAdminMessageId;
    if (!hadSeenMessage || !isNewAdminMessage) return;
    if (_tabController.index == 1) return;
    if (_ownerUnreadChatCount == 0) {
      setState(() {
        _ownerUnreadChatCount = 1;
      });
    }
  }

  String _formatChatTimestamp(String rawValue) {
    final parsed = DateTime.tryParse(rawValue);
    if (parsed == null) return rawValue;
    final local = parsed.toLocal();
    return DateFormat(
      'dd MMM yyyy - HH:mm',
      UiLanguageService.localeName(),
    ).format(local);
  }

  void _scrollChatToBottom({bool animated = true}) {
    if (!_chatScrollController.hasClients) return;
    final target = _chatScrollController.position.maxScrollExtent;
    if (animated) {
      _chatScrollController.animateTo(
        target,
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOut,
      );
      return;
    }
    _chatScrollController.jumpTo(target);
  }

  void _ensureChatAtBottom() {
    if (!_chatScrollController.hasClients) return;
    _scrollChatToBottom(animated: false);
    Future<void>.delayed(const Duration(milliseconds: 40), () {
      if (!mounted || !_chatScrollController.hasClients) return;
      _scrollChatToBottom(animated: false);
    });
    Future<void>.delayed(const Duration(milliseconds: 120), () {
      if (!mounted || !_chatScrollController.hasClients) return;
      _scrollChatToBottom(animated: false);
    });
  }

  Future<void> _openOwnerAppUpdateLink(Map<String, dynamic> data) async {
    final targetUrl =
        (data['targetUrl'] ?? data['playStoreUrl'] ?? '').toString().trim();
    if (targetUrl.isEmpty) return;
    final uri = Uri.tryParse(targetUrl);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  void _showAvailabilityDialog(Map<String, dynamic> request) {
    if (!mounted) return;
    _showingAvailabilityDialog = true;
    final demandId = (request['id'] ?? '').toString().trim();
    final title = _ownerPropertyName(request);
    final startDate = (request['start_date'] ?? '').toString();
    final endDate = (request['end_date'] ?? '').toString();
    final guests = (request['guests'] ?? '').toString();
    final adultGuests =
        _parseGuestCount(request['adult_guests'] ?? request['adultGuests']);
    final childGuests =
        _parseGuestCount(request['child_guests'] ?? request['childGuests']);
    final totalGuests = _parseGuestCount(guests);
    final resolvedAdultGuests =
        adultGuests > 0 ? adultGuests : (totalGuests > 0 ? totalGuests : 1);
    final resolvedChildGuests = childGuests >= 0 ? childGuests : 0;
    final coverUrl =
        _resolveMediaUrl((request['cover_media_url'] ?? '').toString());

    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: Text(t('availability_confirm_title')),
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
              Text(
                '${t('availability_arrival')}: ${_formatAvailabilityDate(startDate)}',
              ),
              Text(
                '${t('availability_departure')}: ${_formatAvailabilityDate(endDate)}',
              ),
              Text(
                '${t('availability_travelers')}: ${_formatGuestBreakdown(resolvedAdultGuests, resolvedChildGuests)}',
              ),
              const SizedBox(height: 8),
              Text(
                t('availability_question'),
                style: const TextStyle(color: Color(0xFF4B5563)),
              ),
            ],
          ),
        ),
        actions: [
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: () async {
                try {
                  await _stopAvailabilityRingtone();
                  await PushNotificationService.instance
                      .stopAvailabilityAlarm();
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
              borderRadius: BorderRadius.circular(999),
              child: Ink(
                decoration: BoxDecoration(
                  color: const Color(0xFFF3F6F4),
                  borderRadius: BorderRadius.circular(999),
                ),
                padding:
                    const EdgeInsets.symmetric(horizontal: 28, vertical: 14),
                child: Text(
                  t('availability_no'),
                  style: const TextStyle(
                    color: Color(0xFF1F6A45),
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                  ),
                ),
              ),
            ),
          ),
          AnimatedBuilder(
            animation: _availabilityGlowAnimation,
            builder: (context, child) {
              final glow = 0.45 + (_availabilityGlowAnimation.value * 0.55);
              return Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(999),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFF39FF88).withValues(
                        alpha: 0.18 + 0.32 * glow,
                      ),
                      blurRadius: 14 + (16 * glow),
                      spreadRadius: 1 + (4 * glow),
                    ),
                  ],
                ),
                child: child,
              );
            },
            child: ElevatedButton(
              onPressed: () async {
                try {
                  await _stopAvailabilityRingtone();
                  await PushNotificationService.instance
                      .stopAvailabilityAlarm();
                  await _api.respondOwnerAvailabilityRequest(
                    ownerId: _resolvedOwnerId,
                    demandId: demandId,
                    available: true,
                  );
                  if (!mounted) return;
                  Navigator.of(this.context).pop();
                  ScaffoldMessenger.of(this.context).showSnackBar(
                    const SnackBar(
                        content: Text('Reponse envoyee: disponible')),
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
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.white,
                foregroundColor: const Color(0xFF1B9C57),
                elevation: 0,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(999),
                ),
                padding:
                    const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
              ),
              child: Text(t('availability_yes')),
            ),
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
    final promptDate = _formatPromptDate(
      (prompt['promptDate'] ?? '').toString().trim(),
    );

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
      if (_ownerUnreadChatCount != 0) {
        setState(() {
          _ownerUnreadChatCount = 0;
        });
      }
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

  int _parseGuestCount(dynamic value) {
    final parsed = int.tryParse((value ?? '').toString().trim());
    return parsed ?? -1;
  }

  String _formatAvailabilityDate(String rawDate) {
    final parsed = DateTime.tryParse(rawDate.trim());
    if (parsed == null) return rawDate;
    return DateFormat('dd MMMM yyyy', _localeName()).format(parsed);
  }

  String _guestLabel({
    required int count,
    required String singularKey,
    required String pluralKey,
  }) {
    final key = count == 1 ? singularKey : pluralKey;
    return '$count ${t(key)}';
  }

  String _formatGuestBreakdown(int adults, int children) {
    final adultText = _guestLabel(
      count: adults,
      singularKey: 'availability_adult_singular',
      pluralKey: 'availability_adult_plural',
    );
    final childText = _guestLabel(
      count: children,
      singularKey: 'availability_child_singular',
      pluralKey: 'availability_child_plural',
    );
    return '$adultText $childText';
  }

  String _formatPromptDate(String rawDate) {
    final parsed = DateTime.tryParse(rawDate);
    if (parsed == null) return rawDate;
    return DateFormat('dd MMM yyyy', _localeName()).format(parsed);
  }

  String _ownerPropertyName(Map<String, dynamic> payload) {
    final propertyTitle = (payload['propertyTitle'] ??
            payload['nom_bien_mobile'] ??
            payload['bien_nom_bien_mobile'] ??
            payload['bien_titre'] ??
            payload['bien_reference'] ??
            payload['property_title'] ??
            '')
        .toString()
        .trim();
    return propertyTitle.isEmpty ? 'Bien' : propertyTitle;
  }

  bool _isCalendarPromptNotification(Map<String, dynamic> notification) {
    final metadata = notification['metadata'];
    if (metadata is! Map) return false;
    final kind = (metadata['kind'] ?? '').toString().trim();
    return kind == 'calendar_daily_check_prompt';
  }

  bool _hasUnreadPriorityNotifications() {
    return _latestOwnerNotifications.any((notification) {
      if (notification['lu'] == true) return false;
      return !_isCalendarPromptNotification(notification);
    });
  }

  List<Map<String, dynamic>> _sortOwnerNotifications(
    List<Map<String, dynamic>> items,
  ) {
    final sorted =
        items.map((item) => Map<String, dynamic>.from(item)).toList();
    sorted.sort((a, b) {
      final aPrompt = _isCalendarPromptNotification(a);
      final bPrompt = _isCalendarPromptNotification(b);
      if (aPrompt != bPrompt) {
        return aPrompt ? 1 : -1;
      }
      final aCreated =
          (a['createdAt'] ?? a['created_at'] ?? '').toString().trim();
      final bCreated =
          (b['createdAt'] ?? b['created_at'] ?? '').toString().trim();
      return bCreated.compareTo(aCreated);
    });
    return sorted;
  }

  List<Map<String, dynamic>> _sortOwnerChatMessages(
    List<Map<String, dynamic>> items,
  ) {
    final sorted =
        items.map((item) => Map<String, dynamic>.from(item)).toList();
    sorted.sort((a, b) {
      final aCreated =
          (a['createdAt'] ?? a['created_at'] ?? '').toString().trim();
      final bCreated =
          (b['createdAt'] ?? b['created_at'] ?? '').toString().trim();
      return aCreated.compareTo(bCreated);
    });
    return sorted;
  }

  String _formatSimpleDate(DateTime date) {
    final now = DateTime.now();
    final sameYear = date.year == now.year;
    final pattern = sameYear ? 'dd MMM' : 'dd MMM yyyy';
    return DateFormat(pattern, _localeName()).format(date);
  }

  String? _formatDateRangeLine(String? startRaw, String? endRaw) {
    final start = DateTime.tryParse((startRaw ?? '').trim());
    final end = DateTime.tryParse((endRaw ?? '').trim());
    if (start == null && end == null) return null;
    final startText = start == null ? '' : _formatSimpleDate(start);
    final endText = end == null ? startText : _formatSimpleDate(end);
    if (startText.isEmpty && endText.isEmpty) return null;
    if (startText == endText) return startText;
    return '$startText - $endText';
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
    final metadata = notification['metadata'];
    if (metadata is Map) {
      final map = Map<String, dynamic>.from(metadata);
      final kind = (map['kind'] ?? '').toString().trim();
      if (kind == 'reservation_availability_request') {
        return _OwnerNotificationViewData(
          title: 'Disponibilite demandee',
          subtitle: _ownerPropertyName(map),
          dateLine: _formatDateRangeLine(
            (map['startDate'] ?? '').toString(),
            (map['endDate'] ?? '').toString(),
          ),
        );
      }
      if (kind == 'calendar_daily_check_prompt') {
        return _OwnerNotificationViewData(
          title: 'Mise a jour calendrier',
          subtitle: 'Verifiez si vos calendriers sont a jour.',
          dateLine: _formatPromptDate(
            (map['promptDate'] ?? '').toString().trim(),
          ),
        );
      }
      if (kind == 'owner_app_update') {
        return _OwnerNotificationViewData(
          title: 'Mise a jour application',
          subtitle: 'Touchez pour ouvrir Google Play Store.',
          dateLine: null,
        );
      }
    }
    final title = _cleanOwnerNotificationTitle(rawMessage);
    final createdAt =
        (notification['createdAt'] ?? notification['created_at'] ?? '')
            .toString()
            .trim();
    final createdDate = DateTime.tryParse(createdAt);
    return _OwnerNotificationViewData(
      title: title.isEmpty ? 'Notification' : title,
      subtitle: null,
      dateLine: _buildOwnerNotificationDateLine(rawMessage) ??
          (createdDate == null ? null : _formatSimpleDate(createdDate)),
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
          cacheExtent: 1800,
          key: const PageStorageKey<String>('owner-properties-list'),
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
            child: _chatLoading && !_chatLoaded
                ? const Center(child: CircularProgressIndicator())
                : _ownerChatMessages.isEmpty
                    ? Center(child: Text(t('chat_empty')))
                    : RefreshIndicator(
                        onRefresh: () => _refreshComms(showChatLoader: false),
                        child: ListView.separated(
                          controller: _chatScrollController,
                          padding: const EdgeInsets.fromLTRB(2, 8, 2, 18),
                          itemCount: _ownerChatMessages.length,
                          separatorBuilder: (_, __) =>
                              const SizedBox(height: 14),
                          itemBuilder: (context, index) {
                            final msg = _ownerChatMessages[index];
                            final kind = (msg['kind'] ?? '').toString();
                            final text = (msg['text'] ?? '').toString();
                            final createdAt =
                                (msg['createdAt'] ?? '').toString();
                            final fromAdmin = kind == 'admin_owner_chat';
                            final timeLabel = _formatChatTimestamp(createdAt);
                            return Align(
                              alignment: fromAdmin
                                  ? Alignment.centerLeft
                                  : Alignment.centerRight,
                              child: Column(
                                crossAxisAlignment: fromAdmin
                                    ? CrossAxisAlignment.start
                                    : CrossAxisAlignment.end,
                                children: [
                                  if (fromAdmin)
                                    Padding(
                                      padding: const EdgeInsets.only(
                                        left: 8,
                                        bottom: 6,
                                      ),
                                      child: Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Container(
                                            width: 28,
                                            height: 28,
                                            decoration: const BoxDecoration(
                                              gradient: LinearGradient(
                                                colors: [
                                                  Color(0xFF0F5132),
                                                  Color(0xFF1F8A5B),
                                                ],
                                              ),
                                              shape: BoxShape.circle,
                                            ),
                                            alignment: Alignment.center,
                                            child: const Icon(
                                              Icons.support_agent_rounded,
                                              color: Colors.white,
                                              size: 16,
                                            ),
                                          ),
                                          const SizedBox(width: 8),
                                          const Text(
                                            'Admin Dwira',
                                            style: TextStyle(
                                              fontSize: 12,
                                              fontWeight: FontWeight.w700,
                                              color: Color(0xFF4B5563),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  Container(
                                    constraints:
                                        const BoxConstraints(maxWidth: 340),
                                    padding: const EdgeInsets.fromLTRB(
                                        16, 14, 16, 12),
                                    decoration: BoxDecoration(
                                      gradient: fromAdmin
                                          ? const LinearGradient(
                                              begin: Alignment.topLeft,
                                              end: Alignment.bottomRight,
                                              colors: [
                                                Color(0xFFFFFFFF),
                                                Color(0xFFF1F5F9),
                                              ],
                                            )
                                          : const LinearGradient(
                                              begin: Alignment.topLeft,
                                              end: Alignment.bottomRight,
                                              colors: [
                                                Color(0xFF177245),
                                                Color(0xFF22A05B),
                                              ],
                                            ),
                                      borderRadius: BorderRadius.only(
                                        topLeft: const Radius.circular(24),
                                        topRight: const Radius.circular(24),
                                        bottomLeft: Radius.circular(
                                          fromAdmin ? 8 : 24,
                                        ),
                                        bottomRight: Radius.circular(
                                          fromAdmin ? 24 : 8,
                                        ),
                                      ),
                                      border: fromAdmin
                                          ? Border.all(
                                              color: const Color(0xFFE2E8F0),
                                            )
                                          : null,
                                      boxShadow: [
                                        BoxShadow(
                                          color: fromAdmin
                                              ? const Color(0x12000000)
                                              : const Color(0x26177245),
                                          blurRadius: 18,
                                          offset: const Offset(0, 10),
                                        ),
                                      ],
                                    ),
                                    child: Column(
                                      crossAxisAlignment: fromAdmin
                                          ? CrossAxisAlignment.start
                                          : CrossAxisAlignment.end,
                                      children: [
                                        Text(
                                          text,
                                          style: TextStyle(
                                            fontSize: 16,
                                            height: 1.38,
                                            color: fromAdmin
                                                ? const Color(0xFF111827)
                                                : Colors.white,
                                          ),
                                        ),
                                        const SizedBox(height: 10),
                                        Container(
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 10,
                                            vertical: 5,
                                          ),
                                          decoration: BoxDecoration(
                                            color: fromAdmin
                                                ? const Color(0xFFF8FAFC)
                                                : const Color(0x1FFFFFFF),
                                            borderRadius:
                                                BorderRadius.circular(999),
                                          ),
                                          child: Text(
                                            timeLabel,
                                            style: TextStyle(
                                              fontSize: 11,
                                              fontWeight: FontWeight.w600,
                                              color: fromAdmin
                                                  ? const Color(0xFF64748B)
                                                  : const Color(0xFFF0FDF4),
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            );
                          },
                        ),
                      ),
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: const Color(0xFFF7FBF8),
              borderRadius: BorderRadius.circular(26),
              border: Border.all(color: const Color(0xFFDCE8E0)),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x0D000000),
                  blurRadius: 16,
                  offset: Offset(0, 8),
                ),
              ],
            ),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _chatController,
                    minLines: 1,
                    maxLines: 3,
                    decoration: InputDecoration(
                      hintText: t('chat_input'),
                      filled: true,
                      fillColor: Colors.white,
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 18,
                        vertical: 18,
                      ),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(20),
                        borderSide: BorderSide.none,
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(20),
                        borderSide: BorderSide.none,
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(20),
                        borderSide: const BorderSide(
                          color: Color(0xFF177245),
                          width: 1.5,
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Material(
                  color: const Color(0xFF177245),
                  borderRadius: BorderRadius.circular(22),
                  elevation: 0,
                  child: InkWell(
                    onTap: _sendingChat ? null : _sendChat,
                    borderRadius: BorderRadius.circular(22),
                    child: SizedBox(
                      width: 62,
                      height: 62,
                      child: Center(
                        child: _sendingChat
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Icon(
                                Icons.send_rounded,
                                color: Colors.white,
                                size: 24,
                              ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
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
        final items = _sortOwnerNotifications(
          snapshot.data ?? const <Map<String, dynamic>>[],
        );
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
                            if ((view.subtitle ?? '').isNotEmpty) ...[
                              const SizedBox(height: 4),
                              Text(
                                view.subtitle!,
                                style: const TextStyle(
                                  fontSize: 14,
                                  color: Color(0xFF475569),
                                  height: 1.3,
                                ),
                              ),
                            ],
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
                                child: Wrap(
                                  spacing: 8,
                                  runSpacing: 8,
                                  children: [
                                    TextButton(
                                      onPressed: () async {
                                        await _api.markOwnerNotificationRead(
                                          ownerId: _resolvedOwnerId,
                                          notificationId: id,
                                        );
                                        await _refreshComms();
                                      },
                                      child: Text(t('mark_read')),
                                    ),
                                    if ((n['metadata'] is Map) &&
                                        (((n['metadata'] as Map)['kind'] ?? '')
                                                .toString()
                                                .trim() ==
                                            'owner_app_update'))
                                      FilledButton.tonal(
                                        onPressed: () async {
                                          final metadata =
                                              Map<String, dynamic>.from(
                                            n['metadata'] as Map,
                                          );
                                          await _openOwnerAppUpdateLink(
                                              metadata);
                                        },
                                        child: const Text('Ouvrir Play Store'),
                                      ),
                                  ],
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
        child: Scaffold(
          backgroundColor: const Color(0xFFF4FBF7),
          appBar: AppBar(
            backgroundColor: const Color(0xFFF4FBF7),
            surfaceTintColor: Colors.transparent,
            scrolledUnderElevation: 0,
            title: Text(
              t('my_properties'),
              style: const TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: Color(0xFF14532D),
              ),
            ),
            actions: [
              Padding(
                padding: const EdgeInsets.only(right: 6),
                child: _OwnerActionButton(
                  icon: Icons.language_rounded,
                  onTap: _showLanguageSheet,
                ),
              ),
              Padding(
                padding: const EdgeInsets.only(right: 6),
                child: _OwnerActionButton(
                  icon: Icons.qr_code_2_rounded,
                  onTap: _showOwnerQr,
                ),
              ),
              Padding(
                padding: const EdgeInsets.only(right: 12),
                child: _OwnerActionButton(
                  icon: Icons.logout_rounded,
                  onTap: () => _logout(context),
                ),
              ),
            ],
            bottom: TabBar(
              controller: _tabController,
              dividerColor: Colors.transparent,
              indicatorColor: const Color(0xFF177245),
              indicatorWeight: 4,
              indicatorSize: TabBarIndicatorSize.label,
              labelColor: const Color(0xFF14532D),
              unselectedLabelColor: const Color(0xFF6B7280),
              tabs: [
                Tab(
                  icon: const Icon(Icons.home_work_outlined),
                  text: t('tab_properties'),
                ),
                Tab(
                  icon: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      const Icon(Icons.chat_bubble_outline),
                      if (_ownerUnreadChatCount > 0)
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
            controller: _tabController,
            children: [
              _buildPropertiesTab(),
              _buildChatTab(),
              _buildNotificationsTab(),
            ],
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

class _OwnerActionButton extends StatelessWidget {
  const _OwnerActionButton({
    required this.icon,
    required this.onTap,
  });

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          width: 46,
          height: 46,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFDCE8E0)),
            boxShadow: const [
              BoxShadow(
                color: Color(0x0A000000),
                blurRadius: 12,
                offset: Offset(0, 6),
              ),
            ],
          ),
          child: Icon(
            icon,
            color: const Color(0xFF14532D),
          ),
        ),
      ),
    );
  }
}

class _OwnerNotificationViewData {
  final String title;
  final String? subtitle;
  final String? dateLine;

  const _OwnerNotificationViewData({
    required this.title,
    required this.subtitle,
    required this.dateLine,
  });
}
