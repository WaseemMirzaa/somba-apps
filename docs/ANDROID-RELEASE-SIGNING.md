# Android release signing

Audit finding S-05. This page is for the **owner of the project**: it explains why the Android apps must be signed with
a real release key, and exactly what to do on your own machine to create one. Nobody else should ever see the key, and
nothing in this repository creates, stores or prints it.

## Why

Until now both Android apps (customer `mobile/`, rider `rider-app/`) were signed with the **debug key**, and the GitHub
workflows published those APKs as GitHub Releases. The debug key is the same on every developer machine and is public
knowledge. Two consequences:

- Anyone can build a modified app, sign it with the debug key and have it install **over** ours (Android accepts an
  update when the signature matches). That is a way to steal sessions, payments and rider locations.
- The Play Store rejects a debug-signed app.

The fix in the build: when a release key is configured, the release build is signed with it. Until you configure one,
nothing breaks (the build falls back to the debug key), but Gradle prints a loud warning and the APK must not be given
to anyone.

## How the build chooses the key

For each app, `android/app/build.gradle.kts` reads the key from, in this order:

1. `android/key.properties` (git-ignored) with four entries:

   ```properties
   storeFile=/Users/you/keys/somba-release.jks
   storePassword=...
   keyAlias=somba-release
   keyPassword=...
   ```

   `storeFile` may be absolute, or relative to `android/app`.

2. The environment variables `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and
   `ANDROID_KEY_PASSWORD` (this is what the GitHub workflows set from repository secrets).

A source counts only when all four values are present. Then:

| Situation | Result of `flutter build apk --release` |
| --- | --- |
| A complete key is configured | Signed with it. |
| No complete key | Signed with the **debug key**, with a boxed Gradle warning. Fine for your own testing, never to distribute. |
| No complete key and `REQUIRE_RELEASE_SIGNING=true` | The build **fails** with a message saying what is missing. |

Debug builds (`flutter run`, `flutter build apk --debug`) are not affected and stay quiet.

## Create the key (once, on your own machine)

Use a machine you trust, not a CI runner and not a shared drive. Requires a JDK (`keytool` ships with it).

```sh
keytool -genkeypair -v \
  -keystore ~/somba-release.jks \
  -storetype PKCS12 \
  -keyalg RSA -keysize 4096 \
  -validity 10000 \
  -alias somba-release
```

- `-keysize 4096` (2048 is the minimum acceptable); `-validity 10000` is about 27 years (Play requires a key valid beyond
  October 2033; the key must outlive the app).
- keytool asks for a password and for your name and organisation. Type the password at the prompt; do **not** put it on
  the command line (it would end up in your shell history). For a PKCS12 keystore the key password is the same as the
  store password, so you will have one password; use it for both `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_PASSWORD`.
- Check it: `keytool -list -v -keystore ~/somba-release.jks`.

### One key or two?

**Recommendation: one shared key, alias `somba-release`, used by both apps.** Both workflows read the same four
secrets, so one key means one set of secrets, one backup and no way to mix them up. The two apps have different
application ids, so sharing the key does not link them.

The alternative is one key per app (`somba-release` for the customer app, `somba-rider-release` for the rider app, in two
`.jks` files). That limits the damage if one key leaks, but doubles the secrets and backups, and the rider workflow would
need its own secret names (change the `secrets.ANDROID_*` references in `.github/workflows/rider-app-apk.yml`). Only do
this if you want that separation. The command is the same with `-alias somba-rider-release` and another file name.

## Add it to GitHub

1. Turn the keystore into one line of text and put it on the clipboard (macOS):

   ```sh
   base64 -i ~/somba-release.jks | tr -d '\n' | pbcopy
   ```

   On Linux: `base64 -w0 ~/somba-release.jks`.

2. In the repository: **Settings, Secrets and variables, Actions, New repository secret**, and add these four:

   | Secret | Value |
   | --- | --- |
   | `ANDROID_KEYSTORE_BASE64` | the base64 text from step 1 |
   | `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
   | `ANDROID_KEY_ALIAS` | `somba-release` |
   | `ANDROID_KEY_PASSWORD` | the key password (same as the store password for PKCS12) |

   Then clear the clipboard.

3. From then on, a push or a manual run of `customer-app-apk.yml` / `rider-app-apk.yml` decodes the keystore into the
   runner's temp folder, signs with it, and sets `REQUIRE_RELEASE_SIGNING=true` so the job that publishes the GitHub
   Release cannot silently fall back to the debug key. Pull-request builds are not given the key: they stay debug-signed
   (they publish nothing). Without `ANDROID_KEYSTORE_BASE64` the workflows behave exactly as before.

4. Check a published APK (Android SDK build-tools): `apksigner verify --print-certs komoriko-customer.apk`. The certificate
   must be yours, not "Android Debug".

To build a signed APK on your own machine instead, create `android/key.properties` as shown above (it is git-ignored,
as are `*.jks` and `*.keystore`).

## Back it up. Offline. Today.

**If you lose this key, nobody can ever update the installed app again.** Android refuses an update signed with a
different key, and there is no recovery. Right after creating it:

- Copy `somba-release.jks` to at least two separate offline places (an encrypted USB stick in a safe, an offline
  encrypted backup). A copy in a cloud folder that syncs is better than nothing, but not a plan.
- Store the password in a password manager, **separately** from the file.
- Never commit it, e-mail it or paste it into a chat. If you think it leaked, treat it as lost and plan a re-key (see
  Play App Signing below for how Play can help).

## Google Play App Signing

If you publish on the Play Store, enrol in **Play App Signing** (the default for new apps). Then the key you made here
becomes the **upload key**: Google keeps the real app-signing key and re-signs what you upload, and if you lose the
upload key you can ask Google to reset it. That is a real safety net, so do it if you go to Play.

One consequence to know: a copy installed from the Play Store is signed with Google's key, while the APK on GitHub
Releases is signed with yours. Android treats them as different publishers, so a user cannot update one with the other
(uninstall first). Pick one distribution channel per user group. Also, Play wants an app bundle (`.aab`); the workflows
here build APKs only.

## Migration warning

An APK signed with the new key **cannot update** an install signed with the old debug key. Android will say the app was
not installed because it conflicts with the existing package. Every user (and every tester) must **uninstall the app
first** and install the new build; local app data (the login) is lost with the uninstall, but the account and its data
live on the server.

Also: the GitHub Releases already published (`customer-apk-v*`, `rider-apk-v*`) are debug-signed. Once the first release
signed with the real key is out, delete or replace the old ones so nobody installs a debug-signed APK, and tell the
people who have it installed to reinstall.
