import 'dart:async';
import 'dart:convert';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter/services.dart';

import '../firebase_options.dart' as firebase_options;

final FlutterLocalNotificationsPlugin _backgroundLocalNotifications =
    FlutterLocalNotificationsPlugin();

@pragma('vm:entry-point')
void notificationTapBackground(NotificationResponse notificationResponse) {
  // Launch payload is recovered via getNotificationAppLaunchDetails().
}

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp(
    options: firebase_options.DefaultFirebaseOptions.currentPlatform,
  );
  await PushNotificationService.ensureBackgroundNotificationsReady();
  await PushNotificationService.showBackgroundNotification(message);
}

class PushNotificationService {
  PushNotificationService._();

  static final PushNotificationService instance = PushNotificationService._();
  static const String _availabilityKind = 'reservation_availability_request';
  static const String _adminReservationKind = 'reservation_submitted';
  static const String _adminReservationAttemptKind = 'reservation_attempt';
  static const String _adminCalendarKind = 'calendar_update_request';
  static const String _availabilityChannelId = 'owner_availability_requests_v2';
  static const String _adminAlertChannelId = 'admin_alerts_v2';
  static const int _iosRecurringAvailabilityNotificationId = 41002;
  static const Duration _iosRecurringAvailabilityInterval = Duration(
    minutes: 1,
  );
  static const String _iosAvailabilitySound = 'availability_request.wav';
  static const MethodChannel _availabilityAlarmChannel =
      MethodChannel('dwira/availability_alarm');
  static bool _backgroundNotificationsReady = false;

  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  static const AndroidNotificationChannel _defaultChannel =
      AndroidNotificationChannel(
    'owner_notifications',
    'Owner Notifications',
    description: 'Notifications envoyees aux proprietaires',
    importance: Importance.high,
  );

  static const AndroidNotificationChannel _availabilityChannel =
      AndroidNotificationChannel(
    _availabilityChannelId,
    'Demandes de disponibilite',
    description: 'Demandes urgentes de confirmation proprietaire',
    importance: Importance.max,
    playSound: true,
  );

  static const AndroidNotificationChannel _adminAlertChannel =
      AndroidNotificationChannel(
    _adminAlertChannelId,
    'Admin Alerts',
    description: 'Alertes admin pour reservations et calendrier',
    importance: Importance.max,
    playSound: true,
  );

  bool _initialized = false;
  StreamSubscription<RemoteMessage>? _foregroundSubscription;
  final StreamController<Map<String, dynamic>> _notificationTapController =
      StreamController<Map<String, dynamic>>.broadcast();
  Map<String, dynamic>? _launchNotificationPayload;

  static Future<void> ensureBackgroundNotificationsReady() async {
    if (_backgroundNotificationsReady || kIsWeb) return;
    const androidSettings =
        AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosSettings = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );
    const initSettings = InitializationSettings(
      android: androidSettings,
      iOS: iosSettings,
      macOS: iosSettings,
    );
    await _backgroundLocalNotifications.initialize(initSettings);
    final androidPlugin =
        _backgroundLocalNotifications.resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>();
    await androidPlugin?.createNotificationChannel(_defaultChannel);
    await androidPlugin?.createNotificationChannel(_availabilityChannel);
    await androidPlugin?.createNotificationChannel(_adminAlertChannel);
    _backgroundNotificationsReady = true;
  }

  static Future<void> showBackgroundNotification(RemoteMessage message) async {
    if (kIsWeb) return;
    final notification = message.notification;
    final title =
        notification?.title ?? _stringValueStatic(message.data['title']);
    final body = notification?.body ?? _stringValueStatic(message.data['body']);
    final kind = _stringValueStatic(message.data['kind']);
    final isAvailabilityRequest = kind == _availabilityKind;
    final isAdminAlert = _isAdminAlertKind(kind);
    if (title.isEmpty && body.isEmpty) return;
    final channel = isAvailabilityRequest
        ? _availabilityChannel
        : isAdminAlert
            ? _adminAlertChannel
            : _defaultChannel;
    final resolvedTitle = title.isEmpty ? 'Notification' : title;
    final resolvedBody = body.isEmpty ? null : body;
    await _backgroundLocalNotifications.show(
      message.hashCode,
      resolvedTitle,
      resolvedBody,
      NotificationDetails(
        android: AndroidNotificationDetails(
          channel.id,
          channel.name,
          channelDescription: channel.description,
          importance: Importance.max,
          priority: Priority.high,
          category: isAvailabilityRequest || isAdminAlert
              ? AndroidNotificationCategory.alarm
              : AndroidNotificationCategory.message,
          fullScreenIntent: isAvailabilityRequest,
          ongoing: isAvailabilityRequest,
          autoCancel: !isAvailabilityRequest,
        ),
        iOS: _buildDarwinDetails(
          isAvailabilityRequest: isAvailabilityRequest,
          isAdminAlert: isAdminAlert,
        ),
      ),
      payload: _encodePayload(
        _buildNotificationPayload(
          title: title,
          body: body,
          data: message.data,
          messageId: message.messageId,
        ),
      ),
    );
    if (defaultTargetPlatform == TargetPlatform.iOS && isAvailabilityRequest) {
      await _scheduleIosRecurringAvailabilityNotification(
        plugin: _backgroundLocalNotifications,
        title: resolvedTitle,
        body: resolvedBody,
        payload: _encodePayload(
          _buildNotificationPayload(
            title: title,
            body: body,
            data: message.data,
            messageId: message.messageId,
          ),
        ),
      );
    }
  }

  Future<void> initialize() async {
    if (_initialized) return;

    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
    await FirebaseMessaging.instance.setAutoInitEnabled(true);

    const androidSettings =
        AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosSettings = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );
    const initSettings = InitializationSettings(
      android: androidSettings,
      iOS: iosSettings,
      macOS: iosSettings,
    );

    await _localNotifications.initialize(
      initSettings,
      onDidReceiveNotificationResponse: _handleNotificationResponse,
      onDidReceiveBackgroundNotificationResponse: notificationTapBackground,
    );

    final launchDetails =
        await _localNotifications.getNotificationAppLaunchDetails();
    if (launchDetails?.didNotificationLaunchApp == true) {
      _launchNotificationPayload = _decodePayload(
        launchDetails?.notificationResponse?.payload,
      );
    }

    final androidPlugin =
        _localNotifications.resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>();
    await androidPlugin?.createNotificationChannel(_defaultChannel);
    await androidPlugin?.createNotificationChannel(_availabilityChannel);
    await androidPlugin?.createNotificationChannel(_adminAlertChannel);
    await androidPlugin?.requestNotificationsPermission();

    await FirebaseMessaging.instance
        .setForegroundNotificationPresentationOptions(
      alert: false,
      badge: false,
      sound: false,
    );

    _foregroundSubscription ??= FirebaseMessaging.onMessage.listen(
      _showForegroundNotification,
    );

    _initialized = true;
  }

  Future<NotificationSettings> requestPermission() async {
    if (defaultTargetPlatform == TargetPlatform.iOS ||
        defaultTargetPlatform == TargetPlatform.macOS) {
      await _localNotifications
          .resolvePlatformSpecificImplementation<
              IOSFlutterLocalNotificationsPlugin>()
          ?.requestPermissions(
            alert: true,
            badge: true,
            sound: true,
          );
      await _localNotifications
          .resolvePlatformSpecificImplementation<
              MacOSFlutterLocalNotificationsPlugin>()
          ?.requestPermissions(
            alert: true,
            badge: true,
            sound: true,
          );
    }
    return FirebaseMessaging.instance.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: false,
    );
  }

  Future<String?> getToken() {
    return FirebaseMessaging.instance.getToken();
  }

  Stream<String> get onTokenRefresh =>
      FirebaseMessaging.instance.onTokenRefresh;

  Stream<RemoteMessage> get onMessage => FirebaseMessaging.onMessage;
  Stream<Map<String, dynamic>> get onNotificationTap =>
      _notificationTapController.stream;

  Map<String, dynamic>? takeLaunchNotificationPayload() {
    final payload = _launchNotificationPayload;
    _launchNotificationPayload = null;
    return payload;
  }

  Future<void> stopAvailabilityAlarm() async {
    if (kIsWeb) return;
    if (defaultTargetPlatform == TargetPlatform.iOS) {
      await _cancelIosRecurringAvailabilityNotification();
      return;
    }
    if (defaultTargetPlatform != TargetPlatform.android) return;
    try {
      await _availabilityAlarmChannel.invokeMethod<void>('stop');
    } catch (_) {
      // Ignore native stop failures and keep local fallback behavior.
    }
  }

  Future<void> showAvailabilityRequestNotification({
    required String notificationId,
    required String title,
    required String body,
  }) async {
    if (kIsWeb) return;
    await _showLocalNotification(
      notificationKey: notificationId.hashCode,
      title: title,
      body: body,
      isAvailabilityRequest: true,
      isAdminAlert: false,
    );
  }

  Future<void> showAdminAlertNotification({
    required String notificationId,
    required String title,
    required String body,
  }) async {
    if (kIsWeb) return;
    await _showLocalNotification(
      notificationKey: notificationId.hashCode,
      title: title,
      body: body,
      isAvailabilityRequest: false,
      isAdminAlert: true,
    );
  }

  Future<void> _showForegroundNotification(RemoteMessage message) async {
    if (kIsWeb) return;

    final notification = message.notification;
    final title = notification?.title ?? _stringValue(message.data['title']);
    final body = notification?.body ?? _stringValue(message.data['body']);
    final kind = _stringValue(message.data['kind']);
    final isAvailabilityRequest = kind == _availabilityKind;
    final isAdminAlert = _isAdminAlertKind(kind);

    if (title.isEmpty && body.isEmpty) {
      return;
    }

    await _showLocalNotification(
      notificationKey: message.hashCode,
      title: title.isEmpty ? 'Notification' : title,
      body: body.isEmpty ? null : body,
      isAvailabilityRequest: isAvailabilityRequest,
      isAdminAlert: isAdminAlert,
      payload: _encodePayload(
        _buildNotificationPayload(
          title: title,
          body: body,
          data: message.data,
          messageId: message.messageId,
        ),
      ),
    );
  }

  Future<void> _showLocalNotification({
    required int notificationKey,
    required String title,
    required String? body,
    required bool isAvailabilityRequest,
    required bool isAdminAlert,
    String? payload,
  }) async {
    final channel = isAvailabilityRequest
        ? _availabilityChannel
        : isAdminAlert
            ? _adminAlertChannel
            : _defaultChannel;
    await _localNotifications.show(
      notificationKey,
      title,
      body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          channel.id,
          channel.name,
          channelDescription: channel.description,
          importance: Importance.max,
          priority: Priority.high,
          category: isAvailabilityRequest || isAdminAlert
              ? AndroidNotificationCategory.alarm
              : AndroidNotificationCategory.message,
          fullScreenIntent: isAvailabilityRequest,
          ongoing: isAvailabilityRequest,
          autoCancel: !isAvailabilityRequest,
        ),
        iOS: _buildDarwinDetails(
          isAvailabilityRequest: isAvailabilityRequest,
          isAdminAlert: isAdminAlert,
        ),
      ),
      payload: payload,
    );
    if (defaultTargetPlatform == TargetPlatform.iOS && isAvailabilityRequest) {
      await _scheduleIosRecurringAvailabilityNotification(
        plugin: _localNotifications,
        title: title,
        body: body,
        payload: payload,
      );
    }
  }

  Future<void> _cancelIosRecurringAvailabilityNotification() async {
    await _localNotifications.cancel(_iosRecurringAvailabilityNotificationId);
    await _backgroundLocalNotifications.cancel(
      _iosRecurringAvailabilityNotificationId,
    );
  }

  static Future<void> _scheduleIosRecurringAvailabilityNotification({
    required FlutterLocalNotificationsPlugin plugin,
    required String title,
    required String? body,
    required String? payload,
  }) async {
    await plugin.periodicallyShowWithDuration(
      _iosRecurringAvailabilityNotificationId,
      title,
      body,
      _iosRecurringAvailabilityInterval,
      NotificationDetails(
        iOS: _buildDarwinDetails(
          isAvailabilityRequest: true,
          isAdminAlert: false,
        ),
      ),
      payload: payload,
    );
  }

  static DarwinNotificationDetails _buildDarwinDetails({
    required bool isAvailabilityRequest,
    required bool isAdminAlert,
  }) {
    return DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentBanner: true,
      presentList: true,
      presentSound: true,
      sound: isAvailabilityRequest ? _iosAvailabilitySound : null,
      interruptionLevel: isAvailabilityRequest || isAdminAlert
          ? InterruptionLevel.timeSensitive
          : InterruptionLevel.active,
      threadIdentifier: isAvailabilityRequest
          ? _availabilityChannelId
          : isAdminAlert
              ? _adminAlertChannelId
              : _defaultChannel.id,
    );
  }

  void _handleNotificationResponse(NotificationResponse notificationResponse) {
    final payload = _decodePayload(notificationResponse.payload);
    if (payload == null) return;
    _notificationTapController.add(payload);
  }

  static Map<String, dynamic> _buildNotificationPayload({
    required String title,
    required String? body,
    required Map<String, dynamic> data,
    required String? messageId,
  }) {
    return <String, dynamic>{
      'title': title,
      'body': body ?? '',
      'messageId': messageId ?? '',
      'data': data,
    };
  }

  static String? _encodePayload(Map<String, dynamic> payload) {
    try {
      return jsonEncode(payload);
    } catch (_) {
      return null;
    }
  }

  Map<String, dynamic>? _decodePayload(String? payload) {
    if (payload == null || payload.trim().isEmpty) return null;
    try {
      final decoded = jsonDecode(payload);
      if (decoded is Map<String, dynamic>) {
        return decoded;
      }
      if (decoded is Map) {
        return decoded.map(
          (key, value) => MapEntry(key.toString(), value),
        );
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  String _stringValue(dynamic value) {
    final normalized = (value ?? '').toString().trim();
    return normalized;
  }

  static String _stringValueStatic(dynamic value) {
    final normalized = (value ?? '').toString().trim();
    return normalized;
  }

  static bool _isAdminAlertKind(String kind) {
    return kind == _adminReservationKind ||
        kind == _adminReservationAttemptKind ||
        kind == _adminCalendarKind;
  }
}
