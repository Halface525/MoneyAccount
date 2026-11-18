package com.nimingzhe.moneyaccount;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 自定义插件必须在 super.onCreate 之前注册
        registerPlugin(FilesAccessPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
