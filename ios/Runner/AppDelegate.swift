import Flutter
import UIKit
import UserNotifications
import AVFoundation
import FirebaseCore
import FirebaseMessaging
import flutter_local_notifications

@main
@objc class AppDelegate: FlutterAppDelegate, MessagingDelegate {
    private var availabilityAlarmPlayer: AVAudioPlayer?
    private var availabilityAlarmChannelRegistered = false
    private var pushRegistrationChannelRegistered = false

    override func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        if FirebaseApp.app() == nil {
            FirebaseApp.configure()
        }

        if #available(iOS 10.0, *) {
            UNUserNotificationCenter.current().delegate = self
        }

        Messaging.messaging().delegate = self
        application.registerForRemoteNotifications()

        FlutterLocalNotificationsPlugin.setPluginRegistrantCallback { registry in
            GeneratedPluginRegistrant.register(with: registry)
        }

        GeneratedPluginRegistrant.register(with: self)
        let launchResult = super.application(application, didFinishLaunchingWithOptions: launchOptions)
        registerAvailabilityAlarmChannelWhenReady()
        registerPushRegistrationChannelWhenReady()
        return launchResult
    }

    override func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        Messaging.messaging().apnsToken = deviceToken
        let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        NSLog("APNs token registered: \(token)")
        super.application(application, didRegisterForRemoteNotificationsWithDeviceToken: deviceToken)
    }

    override func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        NSLog("APNs registration failed: \(error.localizedDescription)")
        super.application(application, didFailToRegisterForRemoteNotificationsWithError: error)
    }

    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        let tokenPreview = String((fcmToken ?? "").prefix(24))
        NSLog("FCM registration token updated: \(tokenPreview)")
    }

    private func registerAvailabilityAlarmChannelWhenReady(attempt: Int = 0) {
        if availabilityAlarmChannelRegistered {
            return
        }

        guard let controller = findFlutterViewController() else {
            if attempt < 30 {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in
                    self?.registerAvailabilityAlarmChannelWhenReady(attempt: attempt + 1)
                }
            }
            return
        }

        let alarmChannel = FlutterMethodChannel(
            name: "dwira/availability_alarm",
            binaryMessenger: controller.binaryMessenger
        )
        alarmChannel.setMethodCallHandler { [weak self] call, result in
            switch call.method {
            case "start":
                result(self?.startAvailabilityAlarm() == true)
            case "stop":
                self?.stopAvailabilityAlarm()
                result(nil)
            default:
                result(FlutterMethodNotImplemented)
            }
        }
        availabilityAlarmChannelRegistered = true
    }

    private func registerPushRegistrationChannelWhenReady(attempt: Int = 0) {
        if pushRegistrationChannelRegistered {
            return
        }

        guard let controller = findFlutterViewController() else {
            if attempt < 30 {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in
                    self?.registerPushRegistrationChannelWhenReady(attempt: attempt + 1)
                }
            }
            return
        }

        let pushChannel = FlutterMethodChannel(
            name: "dwira/push_registration",
            binaryMessenger: controller.binaryMessenger
        )
        pushChannel.setMethodCallHandler { call, result in
            switch call.method {
            case "registerRemoteNotifications":
                DispatchQueue.main.async {
                    UIApplication.shared.registerForRemoteNotifications()
                }
                result(true)
            default:
                result(FlutterMethodNotImplemented)
            }
        }
        pushRegistrationChannelRegistered = true
    }

    private func findFlutterViewController() -> FlutterViewController? {
        if let controller = window?.rootViewController as? FlutterViewController {
            return controller
        }

        if #available(iOS 13.0, *) {
            for scene in UIApplication.shared.connectedScenes {
                guard let windowScene = scene as? UIWindowScene else { continue }
                for sceneWindow in windowScene.windows {
                    if let controller = sceneWindow.rootViewController as? FlutterViewController {
                        return controller
                    }
                    if let controller = sceneWindow.rootViewController?.children
                        .compactMap({ $0 as? FlutterViewController })
                        .first {
                        return controller
                    }
                }
            }
        }

        return nil
    }

    private func startAvailabilityAlarm() -> Bool {
        guard availabilityAlarmPlayer?.isPlaying != true else { return true }
        guard let soundURL = Bundle.main.url(
            forResource: "availability_request",
            withExtension: "wav"
        ) else {
            return false
        }

        do {
            try AVAudioSession.sharedInstance().setCategory(
                .playback,
                mode: .default,
                options: [.duckOthers]
            )
            try AVAudioSession.sharedInstance().setActive(true)
            let player = try AVAudioPlayer(contentsOf: soundURL)
            player.numberOfLoops = -1
            player.volume = 1.0
            player.prepareToPlay()
            player.play()
            availabilityAlarmPlayer = player
            return true
        } catch {
            availabilityAlarmPlayer = nil
            return false
        }
    }

    private func stopAvailabilityAlarm() {
        availabilityAlarmPlayer?.stop()
        availabilityAlarmPlayer = nil
        try? AVAudioSession.sharedInstance().setActive(false)
    }
}
