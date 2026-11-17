package fr.pyramid.pdf;

import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintManager;
import android.provider.OpenableColumns;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Arrays;
import java.util.List;

/** Fonctions natives de Pyramid PDF : impression, horodatage RFC 3161, lecture des fichiers ouverts avec l'appli. */
@CapacitorPlugin(name = "PyramidNative")
public class PyramidNativePlugin extends Plugin {

    private static final List<String> TSA_OK = Arrays.asList(
        "http://timestamp.digicert.com", "http://timestamp.sectigo.com", "https://freetsa.org/tsr");

    @Override
    public void load() {
        handleIntent(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        handleIntent(intent);
    }

    /** « Ouvrir avec » (VIEW) et « Partager vers » (SEND) un PDF ou une image. */
    private void handleIntent(Intent intent) {
        if (intent == null) return;
        Uri uri = null;
        if (Intent.ACTION_VIEW.equals(intent.getAction())) uri = intent.getData();
        else if (Intent.ACTION_SEND.equals(intent.getAction())) uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (uri == null) return;
        JSObject o = new JSObject();
        o.put("url", uri.toString());
        notifyListeners("openUrl", o, true);
    }

    @PluginMethod
    public void readUri(PluginCall call) {
        String s = call.getString("url");
        if (s == null) { call.reject("Adresse manquante"); return; }
        new Thread(() -> {
            try {
                Uri uri = Uri.parse(s);
                Context ctx = getContext();
                String name = null;
                if ("content".equals(uri.getScheme())) {
                    try (Cursor c = ctx.getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
                        if (c != null && c.moveToFirst()) name = c.getString(0);
                    } catch (Exception ignored) { }
                }
                if (name == null) name = uri.getLastPathSegment();
                if (name == null || name.isEmpty()) name = "document.pdf";
                try (InputStream in = ctx.getContentResolver().openInputStream(uri)) {
                    if (in == null) throw new Exception("flux vide");
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    byte[] buf = new byte[65536]; int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                    JSObject r = new JSObject();
                    r.put("name", name);
                    r.put("data", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
                    call.resolve(r);
                }
            } catch (Exception e) { call.reject("Lecture impossible : " + e.getMessage()); }
        }).start();
    }

    @PluginMethod
    public void tsa(PluginCall call) {
        String url = call.getString("url"), body = call.getString("body");
        if (url == null || body == null || !TSA_OK.contains(url)) { call.reject("Autorité non autorisée"); return; }
        new Thread(() -> {
            HttpURLConnection c = null;
            try {
                byte[] req = Base64.decode(body, Base64.DEFAULT);
                c = (HttpURLConnection) new URL(url).openConnection();
                c.setRequestMethod("POST");
                c.setConnectTimeout(15000); c.setReadTimeout(20000);
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/timestamp-query");
                try (OutputStream os = c.getOutputStream()) { os.write(req); }
                int code = c.getResponseCode();
                if (code != 200) { call.reject("HTTP " + code); return; }
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                try (InputStream in = c.getInputStream()) { byte[] buf = new byte[8192]; int n; while ((n = in.read(buf)) > 0) out.write(buf, 0, n); }
                JSObject r = new JSObject();
                r.put("data", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
                call.resolve(r);
            } catch (Exception e) { call.reject(e.getMessage()); }
            finally { if (c != null) c.disconnect(); }
        }).start();
    }

    /** Ouvre la fenêtre d'impression d'Android (aperçu, imprimante, copies, couleur, recto verso…). */
    @PluginMethod
    public void printPdf(PluginCall call) {
        String data = call.getString("data");
        final String name = call.getString("name", "document.pdf");
        if (data == null) { call.reject("PDF manquant"); return; }
        try {
            final File f = new File(getContext().getCacheDir(), "impression.pdf");
            try (FileOutputStream fo = new FileOutputStream(f)) { fo.write(Base64.decode(data, Base64.DEFAULT)); }
            getActivity().runOnUiThread(() -> {
                PrintManager pm = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                pm.print(name, new PrintDocumentAdapter() {
                    @Override
                    public void onLayout(PrintAttributes o, PrintAttributes n, CancellationSignal cs, LayoutResultCallback cb, Bundle extras) {
                        if (cs.isCanceled()) { cb.onLayoutCancelled(); return; }
                        cb.onLayoutFinished(new PrintDocumentInfo.Builder(name).setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT).build(), true);
                    }
                    @Override
                    public void onWrite(PageRange[] pages, ParcelFileDescriptor dest, CancellationSignal cs, WriteResultCallback cb) {
                        try (InputStream in = new FileInputStream(f); OutputStream out = new FileOutputStream(dest.getFileDescriptor())) {
                            byte[] buf = new byte[65536]; int n;
                            while ((n = in.read(buf)) > 0) { if (cs.isCanceled()) { cb.onWriteCancelled(); return; } out.write(buf, 0, n); }
                            cb.onWriteFinished(new PageRange[] { PageRange.ALL_PAGES });
                        } catch (Exception e) { cb.onWriteFailed(e.getMessage()); }
                    }
                }, new PrintAttributes.Builder().build());
                call.resolve();
            });
        } catch (Exception e) { call.reject("Impression impossible : " + e.getMessage()); }
    }
}
