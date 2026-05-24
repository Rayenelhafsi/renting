import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter/services.dart';

import '../firebase_options.dart' as firebase_options;

final FlutterLocalNotificationsPlugin _backgroundLocalNotifications =
    FlutterLocalNotificationsPlugin();

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
  static const MethodChannel _availabilityAlarmChannel =
      MethodChannel('dwira/availability_alarm');
  static const String _availabilitySoundAndroid = 'availability_request';
  static const String _availabilitySoundApple = 'availability_request.wav';
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
    'owner_availability_requests',
    'Demandes de disponibilite',
    description: 'Demandes urgentes de confirmation proprietaire',
    importance: Importance.max,
    sound: RawResourceAndroidNotificationSound(_availabilitySoundAndroid),
    playSound: true,
  );

  static const AndroidNotificationChannel _adminAlertChannel =
      AndroidNotificationChannel(
    'admin_alerts',
    'Admin Alerts',
    description: 'Alertes admin pour reservations et calendrier',
    importance: Importance.max,
    sound: RawResourceAndroidNotificationSound(_availabilitySoundAndroid),
    playSound: true,
  );

  bool _initialized = false;
  StreamSubscription<RemoteMessage>? _foregroundSubscription;

  static Future<void> ensureBackgroundNotificationsReady() async {
    if (_backgroundNotificationsReady || kIsWeb) return;
    const androidSettings =
        AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosSettings = DarwinInitializationSettings();
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
    await _backgroundLocalNotifications.show(
      message.hashCode,
      title.isEmpty ? 'Notification' : title,
      body.isEmpty ? null : body,
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
          sound: isAvailabilityRequest || isAdminAlert
              ? const RawResourceAndroidNotificationSound(
                  _availabilitySoundAndroid,
                )
              : null,
        ),
        iOS: DarwinNotificationDetails(
          sound: isAvailabilityRequest || isAdminAlert
              ? _availabilitySoundApple
              : null,
          presentAlert: true,
          presentBadge: true,
          presentBanner: true,
          presentList: true,
          presentSound: true,
        ),
      ),
    );
  }

  Future<void> initialize() async {
    if (_initialized) return;

    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
    await FirebaseMessaging.instance.setAutoInitEnabled(true);

    const androidSettings =
        AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosSettings = DarwinInitializationSettings();
    const initSettings = InitializationSettings(
      android: androidSettings,
      iOS: iosSettings,
      macOS: iosSettings,
    );

    await _localNotifications.initialize(initSettings);

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

  Future<NotificationSettings> requestPermission() {
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

  Future<void> stopAvailabilityAlarm() async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return;
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
    );
  }

  Future<void> _showLocalNotification({
    required int notificationKey,
    required String title,
    required String? body,
    required bool isAvailabilityRequest,
    required bool isAdminAlert,
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
          sound: isAvailabilityRequest || isAdminAlert
              ? const RawResourceAndroidNotificationSound(
                  _availabilitySoundAndroid,
                )
              : null,
        ),
        iOS: DarwinNotificationDetails(
          sound: isAvailabilityRequest || isAdminAlert
              ? _availabilitySoundApple
              : null,
          presentAlert: true,
          presentBadge: true,
          presentBanner: true,
          presentList: true,
          presentSound: true,
        ),
      ),
    );
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
