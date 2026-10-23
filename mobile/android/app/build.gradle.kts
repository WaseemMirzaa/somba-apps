plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
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
        manifestPlaceholders["GOOGLE_MAPS_API_KEY"] = (project.findProperty("GOOGLE_MAPS_API_KEY") as String?) ?: ""
    }

    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
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
