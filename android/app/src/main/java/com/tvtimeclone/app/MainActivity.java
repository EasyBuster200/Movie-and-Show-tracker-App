package com.tvtimeclone.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // Capacitor's Bridge doesn't wire the hardware/gesture back button to WebView history by
    // default — without this override, Android's default behavior just closes the Activity.
    // The app is a real multi-page site (no SPA router), so WebView back-history is exactly
    // "the previous page", matching what the in-app back arrows already do.
    @Override
    public void onBackPressed() {
        if (getBridge().getWebView().canGoBack()) {
            getBridge().getWebView().goBack();
        } else {
            super.onBackPressed();
        }
    }
}
