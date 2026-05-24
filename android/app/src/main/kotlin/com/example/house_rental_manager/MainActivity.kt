package com.example.house_rental_manager

import io.flutter.embedding.engine.FlutterEngine
import io.flutter.embedding.android.FlutterActivity
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            AVAILABILITY_ALARM_CHANNEL,
        ).setMethodCallHandler { call, result ->
            when (call.method) {
                "stop" -> {
                    AlarmForegroundService.stop(this)
                    result.success(null)
                }

                else -> result.notImplemented()
            }
        }
    }

    companion object {
        private const val AVAILABILITY_ALARM_CHANNEL = "dwira/availability_alarm"
    }
}
