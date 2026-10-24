@echo off
rem Shared by install-dev.bat / install-prod.bat: release APK with Android Studio's JDK 21 (Gradle 8.10 does not run on Java 25), then adb install -r on the connected phone.
rem If adb says "offline", run: adb reconnect   (or replug the cable and accept the USB debugging prompt).
set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
set "ADB=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"
cd /d "%~dp0android"
call "%~dp0android\gradlew.bat" assembleRelease --console=plain -q
if errorlevel 1 (echo BUILD FAILED & exit /b 1)
"%ADB%" install -r app\build\outputs\apk\release\app-release.apk
if errorlevel 1 (echo INSTALL FAILED - is the phone connected and authorised? & exit /b 1)
"%ADB%" shell am start -n il.org.tennis.league/.MainActivity
echo done; the app now talks to: %ITA_API_URL%
