import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Gradle does not hand android/local.properties to the build as project properties: the Maps key is read from it here.
val localProperties = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

// ---- Release signing (audit S-05) ----
// The release build is signed with a real release key when one is configured, read in this order:
//   1. android/key.properties  (git-ignored) with storeFile (relative to android/app, or absolute), storePassword,
//      keyAlias, keyPassword;
//   2. the environment variables ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD
//      (this is what the GitHub workflow sets from repository secrets).
// Without a complete set the release build is still signed with the public debug key so local and CI builds keep
// working, but Gradle warns loudly: that APK must never be distributed. REQUIRE_RELEASE_SIGNING=true turns the
// fallback into a build failure. See docs/ANDROID-RELEASE-SIGNING.md.
val releaseSigningFields = mapOf(
    "storeFile" to "ANDROID_KEYSTORE_PATH",
    "storePassword" to "ANDROID_KEYSTORE_PASSWORD",
    "keyAlias" to "ANDROID_KEY_ALIAS",
    "keyPassword" to "ANDROID_KEY_PASSWORD",
)

/** The four signing values from [read], or null unless every one of them is present and not blank. */
fun completeSigning(read: (field: String, envName: String) -> String?): Map<String, String>? {
    val values = releaseSigningFields.mapValues { (field, envName) -> read(field, envName)?.trim().orEmpty() }
    return if (values.values.all { it.isNotEmpty() }) values else null
}

val keyPropertiesFile = rootProject.file("key.properties")
val keyProperties = Properties().apply {
    if (keyPropertiesFile.exists()) keyPropertiesFile.inputStream().use { load(it) }
}
val releaseSigning: Map<String, String>? =
    completeSigning { field, _ -> keyProperties.getProperty(field) } ?: completeSigning { _, envName -> System.getenv(envName) }
val requireReleaseSigning = System.getenv("REQUIRE_RELEASE_SIGNING")?.trim().equals("true", ignoreCase = true)

// Only a build that actually produces a release (assembleRelease, bundleRelease...) is judged, so debug runs stay quiet.
gradle.taskGraph.whenReady {
    val buildsRelease = allTasks.any { it.name.contains("Release") }
    if (releaseSigning == null && buildsRelease) {
        if (requireReleaseSigning) {
            throw GradleException(
                "REQUIRE_RELEASE_SIGNING=true but no complete release signing key (all four values) is configured, so this build would be signed with the " +
                    "public debug key. Provide android/key.properties (storeFile, storePassword, keyAlias, keyPassword) or the " +
                    "environment variables ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD. " +
                    "See docs/ANDROID-RELEASE-SIGNING.md.",
            )
        }
        logger.warn(
            "\n" +
                "============================================================\n" +
                " WARNING: this release build is signed with the DEBUG key.\n" +
                " No release key is configured (android/key.properties or the\n" +
                " ANDROID_KEYSTORE_* env vars). Do NOT distribute this APK:\n" +
                " the debug key is public. See docs/ANDROID-RELEASE-SIGNING.md.\n" +
                "============================================================",
        )
    }
}

android {
    namespace = "com.somba.lipcart"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.somba.lipcart"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        // Google Maps key for the address picker: put GOOGLE_MAPS_API_KEY=... in android/local.properties
        // (git-ignored) or pass -PGOOGLE_MAPS_API_KEY=... to Gradle. Empty disables the map; manual entry still works.
        manifestPlaceholders["GOOGLE_MAPS_API_KEY"] =
            (project.findProperty("GOOGLE_MAPS_API_KEY") as String?) ?: localProperties.getProperty("GOOGLE_MAPS_API_KEY") ?: ""
    }

    signingConfigs {
        // Only defined when a complete key is configured (see "Release signing" above).
        releaseSigning?.let { key ->
            create("release") {
                storeFile = file(key.getValue("storeFile"))
                storePassword = key.getValue("storePassword")
                keyAlias = key.getValue("keyAlias")
                keyPassword = key.getValue("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            // The release key when one is configured; otherwise the debug key (with a loud warning, or a failure under
            // REQUIRE_RELEASE_SIGNING=true) so `flutter run --release` and CI keep working. See "Release signing" above.
            signingConfig = signingConfigs.getByName(if (releaseSigning != null) "release" else "debug")
            // flutter_stripe's R8 rules (the payment sheet classes must survive shrinking).
            proguardFiles("proguard-rules.pro")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

// Reads app/google-services.json when it is there (see the root build file); otherwise push uses the
// FIREBASE_* --dart-define values, or stays off.
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}
