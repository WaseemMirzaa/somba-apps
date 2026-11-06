# flutter_stripe (see the plugin README, Android step 7)
-dontwarn com.stripe.android.pushProvisioning.**
-dontwarn com.google.android.gms.tapandpay.**
-dontwarn kotlinx.parcelize.Parceler$DefaultImpls
-dontwarn kotlinx.parcelize.Parceler
-dontwarn kotlinx.parcelize.Parcelize
# Keep Stripe classes
-keep class com.stripe.** { *; }

# Kotlin standard library and coroutines. With R8's default shrinking the release build lost classes the plugins call
# through generated code (kotlin.coroutines.intrinsics.CoroutineSingletons, then kotlin.Result): every SharedPreferences
# call died with ClassNotFoundException, so the access token could not be saved and sign-up / sign-in ended in
# "Something went wrong" right after the server had accepted them.
-keep class kotlin.** { *; }
-keep class kotlinx.coroutines.** { *; }
-dontwarn kotlin.**
-dontwarn kotlinx.coroutines.**
