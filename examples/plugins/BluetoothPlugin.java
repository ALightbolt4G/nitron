package com.example.plugins;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;

import com.nicron.webview.NitronMethod;
import com.nicron.webview.NitronPlugin;
import com.nicron.webview.PluginCall;

import org.json.JSONObject;

/**
 * Example plugin: Bluetooth LE scanning.
 *
 *   await Nitron.plugins.Bluetooth.isEnabled();            // { enabled: true }
 *   Nitron.on('Bluetooth:found', d => console.log(d));     // { name, address, rssi }
 *   await Nitron.plugins.Bluetooth.startScan();
 *   await Nitron.plugins.Bluetooth.stopScan();
 *
 * Add these to "permissions" in nitron.config.json:
 *   BLUETOOTH_SCAN, BLUETOOTH_CONNECT (Android 12+)   and   ACCESS_FINE_LOCATION (Android 11 and older)
 *
 * NOTE: written as a starting point; test it on a real device (emulators have no Bluetooth).
 */
public class BluetoothPlugin extends NitronPlugin {

    private static final int REQUEST_SCAN = 1;

    private PluginCall pendingScan;
    private ScanCallback scanCallback;

    private BluetoothAdapter adapter() {
        BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return manager == null ? null : manager.getAdapter();
    }

    private String[] scanPermissions() {
        if (Build.VERSION.SDK_INT >= 31) {
            return new String[]{Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT};
        }
        return new String[]{Manifest.permission.ACCESS_FINE_LOCATION};
    }

    private boolean hasScanPermissions() {
        for (String p : scanPermissions()) {
            if (!hasPermission(p)) return false;
        }
        return true;
    }

    @NitronMethod
    @SuppressLint("MissingPermission")
    public void isEnabled(PluginCall call) throws Exception {
        BluetoothAdapter adapter = adapter();
        call.resolve(new JSONObject().put("enabled", adapter != null && adapter.isEnabled()));
    }

    @NitronMethod
    public void startScan(PluginCall call) {
        if (!hasScanPermissions()) {
            // Ask the user, then continue in onRequestPermissionsResult
            synchronized (this) {
                if (pendingScan != null) pendingScan.reject("Interrupted by a new scan request", "INTERRUPTED");
                pendingScan = call;
            }
            requestPermissions(scanPermissions(), REQUEST_SCAN);
            return;
        }
        beginScan(call);
    }

    @Override
    protected void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode != REQUEST_SCAN) return;
        PluginCall call;
        synchronized (this) {
            call = pendingScan;
            pendingScan = null;
        }
        if (call == null) return;

        boolean granted = grantResults.length > 0;
        for (int result : grantResults) {
            if (result != PackageManager.PERMISSION_GRANTED) granted = false;
        }
        if (granted) {
            final PluginCall scanCall = call;
            // Permission callbacks run on the main thread; start the scan elsewhere
            new Thread(new Runnable() {
                @Override
                public void run() {
                    beginScan(scanCall);
                }
            }).start();
        } else {
            call.reject("Bluetooth permission was denied", "PERMISSION_DENIED");
        }
    }

    @SuppressLint("MissingPermission")
    private synchronized void beginScan(PluginCall call) {
        BluetoothAdapter adapter = adapter();
        if (adapter == null || !adapter.isEnabled()) {
            call.reject("Bluetooth is off or not available", "UNAVAILABLE");
            return;
        }
        BluetoothLeScanner scanner = adapter.getBluetoothLeScanner();
        if (scanner == null) {
            call.reject("Bluetooth LE scanning is not available", "UNAVAILABLE");
            return;
        }
        stopScanInternal();

        scanCallback = new ScanCallback() {
            @Override
            public void onScanResult(int callbackType, ScanResult result) {
                try {
                    BluetoothDevice device = result.getDevice();
                    JSONObject found = new JSONObject();
                    found.put("name", device.getName());
                    found.put("address", device.getAddress());
                    found.put("rssi", result.getRssi());
                    emit("found", found);
                } catch (Exception ignored) {
                    // never let one bad result stop the scan
                }
            }

            @Override
            public void onScanFailed(int errorCode) {
                try {
                    emit("error", new JSONObject().put("code", errorCode));
                } catch (Exception ignored) {
                }
            }
        };
        scanner.startScan(scanCallback);
        call.resolve();
    }

    @NitronMethod
    public void stopScan(PluginCall call) {
        stopScanInternal();
        call.resolve();
    }

    @SuppressLint("MissingPermission")
    private synchronized void stopScanInternal() {
        if (scanCallback == null) return;
        BluetoothAdapter adapter = adapter();
        BluetoothLeScanner scanner = adapter == null ? null : adapter.getBluetoothLeScanner();
        if (scanner != null) {
            try {
                scanner.stopScan(scanCallback);
            } catch (Exception ignored) {
            }
        }
        scanCallback = null;
    }

    @Override
    protected void onDestroy() {
        stopScanInternal();
    }
}
