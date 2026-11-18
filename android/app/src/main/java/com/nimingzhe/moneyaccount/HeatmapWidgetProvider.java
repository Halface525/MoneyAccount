package com.nimingzhe.moneyaccount;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.net.Uri;
import android.widget.RemoteViews;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Wide home screen widget: a GitHub-style bookkeeping heatmap.
 *
 * The web layer sends a compact "7 rows x 19 weeks" matrix of 0-4 intensity levels,
 * computed by the same helper the in-app Heatmap uses (src/lib/heatmap.ts). Drawing
 * it as a bitmap here avoids shipping hundreds of Views through RemoteViews.
 */
public class HeatmapWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            appWidgetManager.updateAppWidget(id, buildViews(context));
        }
    }

    /** Called by WidgetPlugin after the snapshot changes */
    public static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, HeatmapWidgetProvider.class));
        if (ids.length == 0) return;
        manager.updateAppWidget(ids, buildViews(context));
    }

    private static RemoteViews buildViews(Context context) {
        SharedPreferences sp = context.getSharedPreferences(MoneyWidgetProvider.PREFS, Context.MODE_PRIVATE);
        boolean dark = "dark".equals(sp.getString("theme", "light"));

        RemoteViews views = new RemoteViews(
            context.getPackageName(),
            dark ? R.layout.widget_heatmap_dark : R.layout.widget_heatmap_light
        );

        int streak = sp.getInt("streak", 0);
        views.setTextViewText(
            R.id.heat_streak,
            streak > 0
                ? context.getString(R.string.heat_streak, streak)
                : context.getString(R.string.heat_streak_none)
        );

        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.CHINA).format(new Date());
        long todayExpense = today.equals(sp.getString("today", "")) ? sp.getLong("todayExpense", 0) : 0;
        long monthExpense = sp.getLong("monthExpense", 0);
        long monthBudget = sp.getLong("monthBudget", 0);
        views.setTextViewText(
            R.id.heat_spent,
            context.getString(
                R.string.heat_spent,
                MoneyWidgetProvider.money(todayExpense),
                MoneyWidgetProvider.money(monthExpense)
            )
        );
        if (monthBudget > 0) {
            long left = monthBudget - monthExpense;
            views.setTextViewText(
                R.id.heat_left,
                left >= 0
                    ? context.getString(R.string.heat_left, MoneyWidgetProvider.money(left))
                    : context.getString(R.string.heat_over, MoneyWidgetProvider.money(-left))
            );
        } else {
            views.setTextViewText(R.id.heat_left, context.getString(R.string.heat_no_budget));
        }

        Bitmap heatmap = buildHeatmap(sp.getString("heatRows", ""), dark);
        if (heatmap != null) {
            views.setImageViewBitmap(R.id.widget_heatmap, heatmap);
        }

        // Whole card -> open the app
        Intent home = new Intent(context, MainActivity.class);
        home.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        views.setOnClickPendingIntent(R.id.widget_root, activityIntent(context, 0, home));

        // Plus -> add page
        views.setOnClickPendingIntent(R.id.widget_add, addIntent(context, 1, "suishouji://add"));

        return views;
    }

    private static PendingIntent addIntent(Context context, int requestCode, String uri) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(uri), context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return activityIntent(context, requestCode, intent);
    }

    private static PendingIntent activityIntent(Context context, int requestCode, Intent intent) {
        return PendingIntent.getActivity(
            context, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    /**
     * "0,1,0,...;...;" -> bitmap. Rows are weekdays (Mon..Sun), columns are weeks.
     * -1 means a future day and is left transparent.
     */
    private static Bitmap buildHeatmap(String raw, boolean dark) {
        if (raw == null || raw.isEmpty()) return null;

        String[] rowStrings = raw.split(";", -1);
        int rows = rowStrings.length;
        if (rows == 0) return null;

        int[][] data = new int[rows][];
        int cols = 0;
        for (int r = 0; r < rows; r++) {
            if (rowStrings[r].isEmpty()) {
                data[r] = new int[0];
                continue;
            }
            String[] cells = rowStrings[r].split(",", -1);
            data[r] = new int[cells.length];
            cols = Math.max(cols, cells.length);
            for (int c = 0; c < cells.length; c++) {
                try {
                    data[r][c] = Integer.parseInt(cells[c].trim());
                } catch (NumberFormatException e) {
                    data[r][c] = 0;
                }
            }
        }
        if (cols == 0) return null;

        int cell = 18;
        int gap = 5;
        int width = cols * cell + (cols - 1) * gap;
        int height = rows * cell + (rows - 1) * gap;

        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);

        int track = dark ? 0xFF3A2E23 : 0xFFF0E4D4;
        int base = dark ? 0xFFF0B45C : 0xFFD97F35;

        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < data[r].length; c++) {
                int value = data[r][c];
                if (value < 0) continue;

                int color;
                if (value == 0) color = track;
                else if (value == 1) color = withAlpha(base, 0.30f);
                else if (value == 2) color = withAlpha(base, 0.55f);
                else if (value == 3) color = withAlpha(base, 0.78f);
                else color = base;

                paint.setColor(color);
                float left = c * (cell + gap);
                float top = r * (cell + gap);
                canvas.drawRoundRect(left, top, left + cell, top + cell, 4, 4, paint);
            }
        }

        return bitmap;
    }

    private static int withAlpha(int color, float alpha) {
        return Color.argb(
            Math.round(255 * alpha),
            Color.red(color),
            Color.green(color),
            Color.blue(color)
        );
    }
}
