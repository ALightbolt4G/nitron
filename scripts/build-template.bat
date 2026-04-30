@echo off
set JAVA_HOME=C:\Users\wWw\jdk17\jdk-17.0.14+7
set PATH=%JAVA_HOME%\bin;%PATH%
set ANDROID_HOME=C:\Users\wWw\android-sdk
set SDKMANAGER=%ANDROID_HOME%\cmdline-tools\latest\cmdline-tools\bin\sdkmanager.bat

echo Accepting licenses...
call "%SDKMANAGER%" --sdk_root="%ANDROID_HOME%" --licenses < yes.txt

echo.
echo Installing Android SDK components...
call "%SDKMANAGER%" --sdk_root="%ANDROID_HOME%" "platforms;android-34" "build-tools;34.0.0"

echo.
echo Verifying android.jar...
set ANDROID_JAR=%ANDROID_HOME%\platforms\android-34\android.jar
if not exist "%ANDROID_JAR%" (
    echo ERROR: android.jar not found at %ANDROID_JAR%
    exit /b 1
)
echo Found android.jar

echo.
echo Compiling WebView activity...
set SRC=template-src\MainActivity.java
set BUILD_DIR=.template-build

if exist "%BUILD_DIR%" rmdir /s /q "%BUILD_DIR%"
mkdir "%BUILD_DIR%"

javac -source 8 -target 8 -bootclasspath "%ANDROID_JAR%" -classpath "%ANDROID_JAR%" -d "%BUILD_DIR%" "%SRC%"
if errorlevel 1 (
    echo ERROR: javac compilation failed
    exit /b 1
)
echo Compiled successfully.

echo.
echo Converting to DEX...
call "%ANDROID_HOME%\build-tools\34.0.0\d8.bat" --lib "%ANDROID_JAR%" --output "%BUILD_DIR%" "%BUILD_DIR%\com\nicron\webview\MainActivity.class"
if errorlevel 1 (
    echo ERROR: d8 conversion failed
    exit /b 1
)
echo DEX created successfully.

echo.
echo Creating template\base.apk...
if not exist template mkdir template
node -e "const JSZip=require('jszip');const fs=require('fs');const z=new JSZip();z.file('classes.dex',fs.readFileSync('.template-build/classes.dex'));z.folder('assets');z.generateAsync({type:'nodebuffer'}).then(c=>{fs.writeFileSync('template/base.apk',c);console.log('base.apk size: '+(c.length/1024).toFixed(1)+'KB')})"

echo.
echo Cleaning up build dir...
rmdir /s /q "%BUILD_DIR%"
echo.
echo Done! Template ready at template\base.apk
