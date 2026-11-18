package com.nimingzhe.moneyaccount;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Data bridge for the home screen widget.
 *
 * The web layer computes a small snapshot (today's expense/income, this month's
 * budget and the resolved theme) and sends it here. We persist it in
 * SharedPreferences and refresh every widget instance immediately. The widget
 * runs in the same UID as the app, so no extra permission is required and this
 * keeps working when "all files access" has not been granted.
 */
@CapacitorPlugin(name = "Widget")
public class WidgetPlugin extends Plugin {

    @PluginMethod
    public void update(PluginCall call) {
        JSObject snapshot = call.getObject("snapshot");
        if (snapshot == null) {
            call.reject("missing snapshot");
            return;
        }

        SharedPreferences sp = getContext().getSharedPreferences(
            MoneyWidgetProvider.PREFS, Context.MODE_PRIVATE
        );
        sp.edit()
            .putString("today", snapshot.optString("today", ""))
            .putString("month", snapshot.optString("month", ""))
            .putLong("todayExpense", snapshot.optLong("todayExpense", 0))
            .putLong("todayIncome", snapshot.optLong("todayIncome", 0))
            .putLong("monthExpense", snapshot.optLong("monthExpense", 0))
            .putLong("monthBudget", snapshot.optLong("monthBudget", 0))
            .putString("heatRows", snapshot.optString("heatRows", ""))
            .putInt("streak", snapshot.optInt("streak", 0))
            .putString("theme", snapshot.optString("theme", "light"))
            .putLong("updatedAt", snapshot.optLong("updatedAt", System.currentTimeMillis()))
            .apply();

        MoneyWidgetProvider.updateAll(getContext());
        HeatmapWidgetProvider.updateAll(getContext());
        call.resolve();
    }
}
