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

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
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
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Fonctions natives de Pyramid PDF : impression, horodatage RFC 3161, lecture des fichiers ouverts avec l'appli,
 *  abonnement Google Play (essai gratuit de 14 jours puis mensuel, vérifié sur l'appareil, aucun serveur). */
@CapacitorPlugin(name = "PyramidNative")
public class PyramidNativePlugin extends Plugin {

    private static final List<String> TSA_OK = Arrays.asList(
        "http://timestamp.digicert.com", "http://timestamp.sectigo.com", "https://freetsa.org/tsr");

    @Override
    public void load() {
        handleIntent(getActivity().getIntent());
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        if (billing != null && billing.isReady()) status(st -> notifyListeners("subChange", st));
    }

    // ===================== Abonnement Google Play =====================
    // Play Console : abonnement « fr.pyramid.pdf.mensuel », forfait de base mensuel (1 €), offre « essai gratuit 14 jours »
    // réservée aux nouveaux clients. Google ne renvoie l'offre d'essai que si ce compte y a encore droit.
    private static final String SUB_ID = "fr.pyramid.pdf.mensuel";
    private BillingClient billing;
    private PluginCall buyCall;

    private final PurchasesUpdatedListener purchasesListener = (result, purchases) -> {
        final PluginCall call = buyCall; buyCall = null;
        int code = result.getResponseCode();
        if (code == BillingClient.BillingResponseCode.OK && purchases != null) {
            boolean pending = false;
            for (Purchase p : purchases) {
                if (p.getPurchaseState() == Purchase.PurchaseState.PENDING) pending = true;
                acknowledge(p);
            }
            final boolean pend = pending;
            status(st -> { if (pend) st.put("pending", true); if (call != null) call.resolve(st); notifyListeners("subChange", st); });
        } else if (code == BillingClient.BillingResponseCode.USER_CANCELED || code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) {
            status(st -> { if (code == BillingClient.BillingResponseCode.USER_CANCELED) st.put("cancelled", true); if (call != null) call.resolve(st); });
        } else if (call != null) call.reject(message(result));
    };

    private static String message(BillingResult r) {
        switch (r.getResponseCode()) {
            case BillingClient.BillingResponseCode.SERVICE_UNAVAILABLE:
            case BillingClient.BillingResponseCode.NETWORK_ERROR:
            case BillingClient.BillingResponseCode.SERVICE_DISCONNECTED: return "Google Play injoignable : vérifie la connexion internet";
            case BillingClient.BillingResponseCode.BILLING_UNAVAILABLE: return "Paiement Google Play indisponible sur cet appareil ou ce compte";
            case BillingClient.BillingResponseCode.ITEM_UNAVAILABLE: return "Abonnement indisponible pour le moment";
            default: return "Erreur Google Play (" + r.getResponseCode() + ")" + (r.getDebugMessage().isEmpty() ? "" : " : " + r.getDebugMessage());
        }
    }

    /** Connexion au service de paiement de Google Play (refaite automatiquement si elle est perdue). */
    private void withBilling(Runnable ok, Consumer<BillingResult> fail) {
        if (billing == null) {
            billing = BillingClient.newBuilder(getContext()).setListener(purchasesListener)
                .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().enablePrepaidPlans().build())
                .enableAutoServiceReconnection().build();
        }
        if (billing.isReady()) { ok.run(); return; }
        billing.startConnection(new BillingClientStateListener() {
            @Override public void onBillingSetupFinished(BillingResult r) {
                if (r.getResponseCode() == BillingClient.BillingResponseCode.OK) ok.run(); else fail.accept(r);
            }
            @Override public void onBillingServiceDisconnected() { }
        });
    }

    private void acknowledge(Purchase p) {
        if (p.getPurchaseState() != Purchase.PurchaseState.PURCHASED || p.isAcknowledged()) return;
        billing.acknowledgePurchase(AcknowledgePurchaseParams.newBuilder().setPurchaseToken(p.getPurchaseToken()).build(), r -> { });
    }

    /** Durée ISO 8601 (P14D, P2W, P1M…) → nombre de jours. */
    private static int days(String iso) {
        Matcher m = Pattern.compile("P(?:(\\d+)Y)?(?:(\\d+)M)?(?:(\\d+)W)?(?:(\\d+)D)?").matcher(iso == null ? "" : iso);
        if (!m.matches()) return 0;
        int[] mul = { 365, 30, 7, 1 }; int d = 0;
        for (int i = 0; i < 4; i++) if (m.group(i + 1) != null) d += Integer.parseInt(m.group(i + 1)) * mul[i];
        return d;
    }

    private ProductDetails product;
    private ProductDetails.SubscriptionOfferDetails trialOffer, baseOffer;

    /** État de l'abonnement (même forme que sur iPhone) : active, trial, loaded, price, eligibleTrial, trialDays. */
    private void status(Consumer<JSObject> done) {
        withBilling(() -> {
            QueryProductDetailsParams q = QueryProductDetailsParams.newBuilder().setProductList(Collections.singletonList(
                QueryProductDetailsParams.Product.newBuilder().setProductId(SUB_ID).setProductType(BillingClient.ProductType.SUBS).build())).build();
            billing.queryProductDetailsAsync(q, (r, res) -> {
                final JSObject out = new JSObject();
                out.put("productId", SUB_ID); out.put("active", false); out.put("trial", false);
                List<ProductDetails> list = res == null ? null : res.getProductDetailsList();
                product = null; trialOffer = null; baseOffer = null;
                if (r.getResponseCode() == BillingClient.BillingResponseCode.OK && list != null && !list.isEmpty()) {
                    product = list.get(0);
                    List<ProductDetails.SubscriptionOfferDetails> offers = product.getSubscriptionOfferDetails();
                    if (offers != null) for (ProductDetails.SubscriptionOfferDetails o : offers) {
                        List<ProductDetails.PricingPhase> ph = o.getPricingPhases().getPricingPhaseList();
                        if (ph.isEmpty()) continue;
                        if (o.getOfferId() == null && baseOffer == null) baseOffer = o;
                        if (ph.get(0).getPriceAmountMicros() == 0 && trialOffer == null) trialOffer = o;
                    }
                    ProductDetails.SubscriptionOfferDetails any = baseOffer != null ? baseOffer : (offers != null && !offers.isEmpty() ? offers.get(0) : null);
                    if (any != null) {
                        List<ProductDetails.PricingPhase> ph = any.getPricingPhases().getPricingPhaseList();
                        out.put("price", ph.get(ph.size() - 1).getFormattedPrice());
                    }
                    out.put("eligibleTrial", trialOffer != null);
                    if (trialOffer != null) out.put("trialDays", days(trialOffer.getPricingPhases().getPricingPhaseList().get(0).getBillingPeriod()));
                    out.put("loaded", true);
                } else out.put("loaded", false);
                billing.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(), (r2, purchases) -> {
                    if (r2.getResponseCode() == BillingClient.BillingResponseCode.OK && purchases != null) for (Purchase p : purchases) {
                        if (!p.getProducts().contains(SUB_ID)) continue;
                        if (p.getPurchaseState() == Purchase.PurchaseState.PURCHASED) { out.put("active", true); out.put("loaded", true); acknowledge(p); }
                        else if (p.getPurchaseState() == Purchase.PurchaseState.PENDING) out.put("pending", true);
                    }
                    done.accept(out);
                });
            });
        }, r -> {
            JSObject out = new JSObject();
            out.put("productId", SUB_ID); out.put("active", false); out.put("loaded", false); out.put("error", message(r));
            done.accept(out);
        });
    }

    @PluginMethod
    public void subStatus(PluginCall call) {
        if ((getContext().getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {   // version de développement : pas d'écran d'abonnement
            JSObject o = new JSObject(); o.put("active", true); o.put("loaded", true); o.put("dev", true); call.resolve(o); return; }
        status(call::resolve);
    }

    @PluginMethod
    public void subRestore(PluginCall call) { subStatus(call); }

    @PluginMethod
    public void subBuy(PluginCall call) {
        status(st -> {
            if (Boolean.TRUE.equals(st.getBool("active"))) { call.resolve(st); return; }
            ProductDetails.SubscriptionOfferDetails offer = trialOffer != null ? trialOffer : baseOffer;
            if (product == null || offer == null) { call.reject(st.has("error") ? st.getString("error") : "Abonnement indisponible pour le moment"); return; }
            BillingFlowParams fp = BillingFlowParams.newBuilder().setProductDetailsParamsList(Collections.singletonList(
                BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(product).setOfferToken(offer.getOfferToken()).build())).build();
            buyCall = call;
            getActivity().runOnUiThread(() -> {
                BillingResult r = billing.launchBillingFlow(getActivity(), fp);
                if (r.getResponseCode() != BillingClient.BillingResponseCode.OK && buyCall == call) { buyCall = null; call.reject(message(r)); }
            });
        });
    }

    /** Ouvre la page « Abonnements » du Play Store (gérer, résilier). */
    @PluginMethod
    public void subManage(PluginCall call) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/account/subscriptions?sku=" + SUB_ID + "&package=" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (Exception e) { call.reject("Impossible d'ouvrir le Play Store"); return; }
        status(call::resolve);
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
