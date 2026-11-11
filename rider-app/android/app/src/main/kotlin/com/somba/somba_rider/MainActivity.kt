package com.somba.somba_rider

import android.app.NotificationChannel
import android.app.NotificationManager
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.content.pm.PackageManager
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        createNotificationChannel()
    }

    /** `com.somba/maps` `hasNativeKey`: whether the Maps SDK was given a key at build time (android/local.properties). */
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "com.somba/maps").setMethodCallHandler { call, result ->
            if (call.method == "hasNativeKey") result.success(hasMapsKey()) else result.notImplemented()
        }
    }

    private fun hasMapsKey(): Boolean = try {
        val info = packageManager.getApplicationInfo(packageName, PackageManager.GET_META_DATA)
        val key = info.metaData?.getString("com.google.android.geo.API_KEY")
        !key.isNullOrBlank() && !key.startsWith("\${")
    } catch (e: Exception) {
        false
    }

    /** The channel every push from the server uses ("somba_default"); heads-up so a new notice is seen. */
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(CHANNEL_ID, getString(R.string.notify_channel_name), NotificationManager.IMPORTANCE_HIGH).apply {
            description = getString(R.string.notify_channel_description)
            // The default notification sound, set explicitly (that is also what a channel without a sound gets, so
            // phones that already created this channel keep working: a channel cannot be changed after creation).
            val attrs = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION), attrs)
            enableVibration(true)
        }
        getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
    }

    companion object {
        const val CHANNEL_ID = "somba_default"
    }
}
