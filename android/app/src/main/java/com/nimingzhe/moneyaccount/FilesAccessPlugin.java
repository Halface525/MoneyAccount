package com.nimingzhe.moneyaccount;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * 文件访问权限。
 *
 * 安卓 11（API 30）起，「分区存储」让 App 只能读写自己创建的文件，
 * 一旦清除应用数据，就再也读不回之前写的文件——这跟「账本以文件形式长期保存」相冲突。
 * 所以这里申请 MANAGE_EXTERNAL_STORAGE（设置里叫「所有文件访问权限」），
 * 拿到之后就能像老系统那样直接读写 /sdcard/Documents/随手记/账本.json。
 *
 * 安卓 10 及以下没有这个概念，申请传统的读写外部存储权限即可。
 */
@CapacitorPlugin(
    name = "FilesAccess",
    permissions = {
        @Permission(
            alias = "publicStorage",
            strings = {
                Manifest.permission.READ_EXTERNAL_STORAGE,
                Manifest.permission.WRITE_EXTERNAL_STORAGE
            }
        )
    }
)
public class FilesAccessPlugin extends Plugin {

    @PluginMethod
    public void status(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", isGranted());
        // 需要去系统设置页开「所有文件访问」，而不是弹权限框
        ret.put("needsSettings", Build.VERSION.SDK_INT >= Build.VERSION_CODES.R);
        call.resolve(ret);
    }

    @PluginMethod
    public void request(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            if (Environment.isExternalStorageManager()) {
                JSObject ret = new JSObject();
                ret.put("granted", true);
                call.resolve(ret);
                return;
            }
            try {
                Intent intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                getActivity().startActivity(intent);
            } catch (Exception e) {
                // 少数 ROM 没有单应用入口，退回总列表
                try {
                    Intent intent = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
                    getActivity().startActivity(intent);
                } catch (Exception ignored) {
                    // 打不开就算了，界面上会提示降级存储位置
                }
            }
            JSObject ret = new JSObject();
            ret.put("granted", false);
            ret.put("openSettings", true);
            call.resolve(ret);
        } else {
            if (getPermissionState("publicStorage") != PermissionState.GRANTED) {
                requestPermissionForAlias("publicStorage", call, "storagePermissionCallback");
            } else {
                JSObject ret = new JSObject();
                ret.put("granted", true);
                call.resolve(ret);
            }
        }
    }

    @PermissionCallback
    private void storagePermissionCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", isGranted());
        call.resolve(ret);
    }

    private boolean isGranted() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            return Environment.isExternalStorageManager();
        }
        return getContext().checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
            == PackageManager.PERMISSION_GRANTED;
    }
}
