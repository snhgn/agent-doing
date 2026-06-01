package com.example.agentdoing

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class AgentForegroundService : Service() {
  companion object {
    const val CHANNEL_ID = "agent_doing_channel"
    const val NOTIF_ID = 1001
    const val EXTRA_ENDPOINT = "endpoint"
  }

  private var client: WSClient? = null

  override fun onCreate() {
    super.onCreate()
    createChannel()
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val channel = NotificationChannel(CHANNEL_ID, "Agent Doing", NotificationManager.IMPORTANCE_LOW)
      nm.createNotificationChannel(channel)
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val endpoint = intent?.getStringExtra(EXTRA_ENDPOINT) ?: "ws://127.0.0.1:9876/status"

    val notifIntent = Intent(this, MainActivity::class.java)
    val pending = PendingIntent.getActivity(this, 0, notifIntent, PendingIntent.FLAG_IMMUTABLE)
    val notif: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Agent Doing")
      .setContentText("Connecting...")
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setContentIntent(pending)
      .build()

    startForeground(NOTIF_ID, notif)

    client = WSClient(endpoint) { msg ->
      // update notification or broadcast locally
      val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val update = NotificationCompat.Builder(this, CHANNEL_ID)
        .setContentTitle("Agent Doing")
        .setContentText(msg)
        .setSmallIcon(android.R.drawable.ic_dialog_info)
        .build()
      nm.notify(NOTIF_ID, update)

      // also broadcast to activity
      val b = Intent("com.example.agentdoing.STATE_UPDATE")
      b.putExtra("payload", msg)
      sendBroadcast(b)
    }

    try { client?.connect() } catch (e: Exception) { }

    return START_STICKY
  }

  override fun onDestroy() {
    client?.close()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null
}
