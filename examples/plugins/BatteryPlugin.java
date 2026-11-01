package com.example.plugins;

import android.content.Intent;
import android.content.IntentFilter;
import android.os.BatteryManager;

import com.nicron.webview.NitronMethod;
import com.nicron.webview.NitronPlugin;
import com.nicron.webview.PluginCall;

import org.json.JSONObject;

/**
 * Example plugin: reads the battery level.
 *
 *   const { level, charging } = await Nitron.plugins.Battery.getStatus();
 *
 * Needs no Android permission.
 */
public class BatteryPlugin extends NitronPlugin {

    @NitronMethod
    public void getStatus(PluginCall call) throws Exception {
        Intent battery = getContext().registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (battery == null) {
            call.reject("Battery status is not available", "UNAVAILABLE");
            return;
        }

        int level = battery.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
        int scale = battery.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
        int status = battery.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
        boolean charging = status == BatteryManager.BATTERY_STATUS_CHARGING
                || status == BatteryManager.BATTERY_STATUS_FULL;

        JSONObject result = new JSONObject();
        result.put("level", level >= 0 && scale > 0 ? Math.round(100f * level / scale) : -1);
        result.put("charging", charging);
        call.resolve(result);
    }
}
