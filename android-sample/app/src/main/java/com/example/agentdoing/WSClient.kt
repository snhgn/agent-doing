package com.example.agentdoing

import okhttp3.*
import okio.ByteString
import java.util.concurrent.TimeUnit

class WSClient(private val url: String, private val listener: (String)->Unit) {
  private val client = OkHttpClient.Builder()
    .pingInterval(15, TimeUnit.SECONDS)
    .build()
  private var ws: WebSocket? = null

  fun connect() {
    val req = Request.Builder().url(url).build()
    ws = client.newWebSocket(req, object : WebSocketListener() {
      override fun onOpen(webSocket: WebSocket, response: Response) {
        listener("connected")
      }

      override fun onMessage(webSocket: WebSocket, text: String) {
        listener(text)
      }

      override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
        listener(bytes.utf8())
      }

      override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
        listener("closed: $code $reason")
      }

      override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
        listener("failure: ${t.message}")
        scheduleReconnect()
      }
    })
  }

  fun send(text: String) {
    ws?.send(text)
  }

  fun close() {
    ws?.close(1000, "bye")
    ws = null
  }

  private fun scheduleReconnect() {
    Thread.sleep(2000)
    try { connect() } catch (_: Exception) {}
  }
}
