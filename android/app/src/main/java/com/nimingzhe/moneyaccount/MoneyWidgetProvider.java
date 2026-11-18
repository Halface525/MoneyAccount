package com.nimingzhe.moneyaccount;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;

import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Home screen widget: today's expense and this month's budget.
 * Tapping "+" opens the add-transaction page.
 *
 * The widget runs inside the launcher process and cannot reach the WebView's
 * IndexedDB, so the web layer computes a tiny snapshot and hands it over through
 * {@link WidgetPlugin}. Amounts travel as integer cents; formatting happens here
 * so the widget matches the system's number style.
 *
 * Display strings live in strings.xml to keep this source ASCII-only.
 */
public class MoneyWidgetProvider extends AppWidgetProvider {

    /** Shared snapshot with WidgetPlugin */
    public static final String PREFS = "money_widget";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            appWidgetManager.updateAppWidget(id, buildViews(context, id));
        }
    }

    /** Resizing the widget changes the cell aspect, so refresh the square card */
    @Override
    public void onAppWidgetOptionsChanged(
        Context context, AppWidgetManager appWidgetManager, int appWidgetId, Bundle newOptions
    ) {
        appWidgetManager.updateAppWidget(appWidgetId, buildViews(context, appWidgetId));
    }

    /** Called by the plugin right after the snapshot changes */
    public static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, MoneyWidgetProvider.class));
        for (int id : ids) {
            manager.updateAppWidget(id, buildViews(context, id));
        }
    }

    private static RemoteViews buildViews(Context context, int widgetId) {
        SharedPreferences sp = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        boolean dark = "dark".equals(sp.getString("theme", "light"));

        RemoteViews views = new RemoteViews(
            context.getPackageName(),
            dark ? R.layout.widget_money_dark : R.layout.widget_money_light
        );

        // If the snapshot is from a previous day/month, the app has not run since:
        // today cannot have transactions yet, and last month's budget must not linger.
        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.CHINA).format(new Date());
        String month = new SimpleDateFormat("yyyy-MM", Locale.CHINA).format(new Date());
        boolean sameDay = today.equals(sp.getString("today", ""));
        boolean sameMonth = month.equals(sp.getString("month", ""));

        long todayExpense = sameDay ? sp.getLong("todayExpense", 0) : 0;
        long monthExpense = sameMonth ? sp.getLong("monthExpense", 0) : 0;
        long monthBudget = sameMonth ? sp.getLong("monthBudget", 0) : 0;

        views.setTextViewText(R.id.today_expense, money(todayExpense));
        views.setTextViewText(
            R.id.widget_date,
            new SimpleDateFormat(
                context.getString(R.string.widget_date_pattern), Locale.CHINA
            ).format(new Date())
        );

        if (monthBudget > 0) {
            long left = monthBudget - monthExpense;
            String text = left >= 0
                ? context.getString(R.string.widget_budget_left, money(left))
                : context.getString(R.string.widget_budget_over, money(-left));
            views.setTextViewText(R.id.budget_text, text);
            int pct = (int) Math.min(100, Math.round(monthExpense * 100.0 / monthBudget));
            views.setProgressBar(R.id.budget_progress, 100, pct, false);
            views.setViewVisibility(R.id.budget_progress, View.VISIBLE);
        } else {
            views.setTextViewText(R.id.budget_text, context.getString(R.string.widget_budget_unset));
            views.setViewVisibility(R.id.budget_progress, View.GONE);
        }

        // Whole card -> open the app
        Intent home = new Intent(context, MainActivity.class);
        home.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent homeIntent = PendingIntent.getActivity(
            context, 0, home, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_card, homeIntent);

        // Plus button -> open the add page through the custom scheme handled in App.tsx
        Intent add = new Intent(Intent.ACTION_VIEW, Uri.parse("suishouji://add"), context, MainActivity.class);
        add.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent addIntent = PendingIntent.getActivity(
            context, 1, add, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_add, addIntent);

        // 桌面的 2×2 格子通常不是正方形（行比列高）。把卡片按短边压成正方形并居中，
        // 视觉上才是真正的 2×2 方块；API 31 以下没有 setViewLayout*，退回铺满。
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            Bundle options = AppWidgetManager.getInstance(context).getAppWidgetOptions(widgetId);
            int w = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
            int h = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
            if (w > 0 && h > 0) {
                int side = Math.min(w, h);
                views.setViewLayoutWidth(R.id.widget_card, side, TypedValue.COMPLEX_UNIT_DIP);
                views.setViewLayoutHeight(R.id.widget_card, side, TypedValue.COMPLEX_UNIT_DIP);
            }
        }

        return views;
    }

    /** 123456 cents -> CNY 1,234.56 */
    static String money(long cents) {
        DecimalFormat format = new DecimalFormat("#,##0.00", new DecimalFormatSymbols(Locale.CHINA));
        return "¥" + format.format(cents / 100.0);
    }
}
