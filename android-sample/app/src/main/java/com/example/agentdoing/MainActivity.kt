package com.example.agentdoing

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
  private lateinit var endpointEdit: EditText
  private lateinit var startBtn: Button
  private lateinit var stopBtn: Button
  private lateinit var statusView: TextView
  private val receiver = object: BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      val payload = intent?.getStringExtra("payload")
      statusView.text = payload ?: "(empty)"
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContentView(R.layout.activity_main)

    endpointEdit = findViewById(R.id.endpointEdit)
    startBtn = findViewById(R.id.startBtn)
    stopBtn = findViewById(R.id.stopBtn)
    statusView = findViewById(R.id.statusView)

    startBtn.setOnClickListener {
      val ep = endpointEdit.text.toString().ifEmpty { "ws://127.0.0.1:9876/status" }
      val i = Intent(this, AgentForegroundService::class.java)
      i.putExtra(AgentForegroundService.EXTRA_ENDPOINT, ep)
      startService(i)
    }

    stopBtn.setOnClickListener {
      val i = Intent(this, AgentForegroundService::class.java)
      stopService(i)
    }
  }

  override fun onResume() {
    super.onResume()
    registerReceiver(receiver, IntentFilter("com.example.agentdoing.STATE_UPDATE"))
  }

  override fun onPause() {
    super.onPause()
    unregisterReceiver(receiver)
  }
}
