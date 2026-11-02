// Firebase: the Google Services Gradle plugin is only needed when app/google-services.json is used. Builds without
// it (CI, or passing the FIREBASE_* --dart-define values instead) never download it. See docs/MOBILE-PUSH.md.
buildscript {
    if (file("app/google-services.json").exists()) {
        repositories {
            google()
            mavenCentral()
        }
        dependencies {
            classpath("com.google.gms:google-services:4.4.2")
        }
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}
// flutter_stripe's Android module lists com.stripe:stripe-android-issuing-push-provisioning, whose
// play-services-tapandpay dependency is not on public Maven. Only the release "lintVital" check of plugin
// modules resolves it (and fails); the app itself never uses push provisioning, so skip that check there.
subprojects {
    if (name != "app") {
        tasks.matching { it.name.startsWith("lintVital") }.configureEach { enabled = false }
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
