package com.example.house_rental_manager

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class AvailabilityFirebaseMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        val kind = message.data["kind"]?.trim().orEmpty()
        if (kind != AVAILABILITY_KIND) {
            return
        }

        val title = message.data["title"]?.trim()
            ?.takeIf { it.isNotEmpty() }
            ?: message.notification?.title
            ?: "Demande de disponibilite"
        val body = message.data["body"]?.trim()
            ?.takeIf { it.isNotEmpty() }
            ?: message.notification?.body
            ?: "Ouvrez l'application pour repondre."
        val demandId = message.data["demandId"]?.trim().orEmpty()

        AlarmForegroundService.start(
            context = applicationContext,
            title = title,
            body = body,
            demandId = demandId,
        )
    }

    companion object {
        private const val AVAILABILITY_KIND = "reservation_availability_request"
    }
}
