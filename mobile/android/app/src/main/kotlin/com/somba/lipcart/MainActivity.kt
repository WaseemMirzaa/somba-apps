package com.somba.lipcart

import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.content.pm.PackageManager
import android.os.Bundle
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/** FlutterFragmentActivity (not FlutterActivity): the Stripe payment sheet is shown through the Support Fragment Manager. */
class MainActivity : FlutterFragmentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        createNotificationChannel()
    }

    /**
     * `com.somba/maps` `hasNativeKey`: whether the Maps SDK was given a key at build time (android/local.properties).
     * The Dart side asks before showing a map; without a key the map would be blank, so the address is typed instead.
     */
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
        }
        getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
    }

    companion object {
        const val CHANNEL_ID = "somba_default"
    }
}
