import UIKit
import Capacitor
import StoreKit
import VisionKit

/// Contrôleur principal : charge Capacitor et enregistre le module natif de Pyramid PDF.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(PyramidNativePlugin())
    }
}

/// Fonctions natives de Pyramid PDF : impression, horodatage RFC 3161, lecture des fichiers ouverts avec l'appli.
@objc(PyramidNativePlugin)
public class PyramidNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PyramidNativePlugin"
    public let jsName = "PyramidNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "printPdf", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "tsa", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readUri", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "subStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "subBuy", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "subRestore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "subManage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scanDoc", returnType: CAPPluginReturnPromise)
    ]
    private var scanCall: CAPPluginCall?
    /// Abonnement mensuel (App Store Connect : groupe « Pyramid PDF », essai gratuit de 2 semaines, 0,99 €/mois)
    private let subId = "fr.pyramid.pdf.mensuel"
    private var updates: Task<Void, Never>?

    override public func load() {
        // Renouvellements, résiliations, achats faits ailleurs (autre appareil, Réglages) : l'interface est prévenue
        updates = Task.detached { [weak self] in
            for await result in Transaction.updates {
                if case .verified(let t) = result { await t.finish() }
                guard let self = self else { return }
                let st = await self.status()
                self.notifyListeners("subChange", data: st)
            }
        }
    }
    deinit { updates?.cancel() }

    /// Scanner de documents d'Apple : détection des bords, redressement, plusieurs pages ; renvoie des JPEG (base64)
    @objc func scanDoc(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard VNDocumentCameraViewController.isSupported else { call.reject("unsupported"); return }
            self.scanCall = call
            let vc = VNDocumentCameraViewController()
            vc.delegate = self
            self.bridge?.viewController?.present(vc, animated: true)
        }
    }
    fileprivate func finishScan(_ c: VNDocumentCameraViewController, pages: [String]?, error: String?) {
        c.dismiss(animated: true) {
            if let e = error { self.scanCall?.reject(e) } else { self.scanCall?.resolve(["pages": pages ?? []]) }
            self.scanCall = nil
        }
    }
    private let tsaOk = ["http://timestamp.digicert.com", "http://timestamp.sectigo.com", "https://freetsa.org/tsr"]

    /// Fenêtre d'impression d'iOS (aperçu, imprimante AirPrint, copies, recto verso…)
    @objc func printPdf(_ call: CAPPluginCall) {
        guard let b = call.getString("data"), let data = Data(base64Encoded: b) else { call.reject("PDF invalide"); return }
        let name = call.getString("name") ?? "document.pdf"
        DispatchQueue.main.async {
            guard UIPrintInteractionController.canPrint(data) else { call.reject("Ce PDF ne peut pas être imprimé"); return }
            let pc = UIPrintInteractionController.shared
            let info = UIPrintInfo(dictionary: nil)
            info.outputType = .general
            info.jobName = name
            pc.printInfo = info
            pc.printingItem = data
            let done: UIPrintInteractionController.CompletionHandler = { _, completed, error in
                if let e = error { call.reject(e.localizedDescription) } else { call.resolve(["printed": completed]) }
            }
            if UIDevice.current.userInterfaceIdiom == .pad, let v = self.bridge?.viewController?.view {
                pc.present(from: CGRect(x: v.bounds.midX, y: v.bounds.midY, width: 1, height: 1), in: v, animated: true, completionHandler: done)
            } else {
                pc.present(animated: true, completionHandler: done)
            }
        }
    }

    /// Demande d'horodatage à une autorité de temps (DigiCert, Sectigo ou FreeTSA)
    @objc func tsa(_ call: CAPPluginCall) {
        guard let u = call.getString("url"), tsaOk.contains(u), let url = URL(string: u),
              let b = call.getString("body"), let body = Data(base64Encoded: b) else { call.reject("Autorité non autorisée"); return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/timestamp-query", forHTTPHeaderField: "Content-Type")
        req.httpBody = body
        req.timeoutInterval = 20
        URLSession.shared.dataTask(with: req) { data, resp, err in
            if let e = err { call.reject(e.localizedDescription); return }
            let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
            guard code == 200, let d = data else { call.reject("HTTP \(code)"); return }
            call.resolve(["data": d.base64EncodedString()])
        }.resume()
    }

    /// Lecture d'un fichier ouvert depuis l'app Fichiers ou partagé vers Pyramid PDF
    @objc func readUri(_ call: CAPPluginCall) {
        guard let s = call.getString("url"), let url = URL(string: s) else { call.reject("Adresse invalide"); return }
        DispatchQueue.global(qos: .userInitiated).async {
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            var result: Data?
            var failure: Error?
            NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: nil) { u in
                do { result = try Data(contentsOf: u) } catch { failure = error }
            }
            if let d = result { call.resolve(["data": d.base64EncodedString(), "name": url.lastPathComponent]) }
            else { call.reject("Lecture impossible : \(failure?.localizedDescription ?? "fichier introuvable")") }
        }
    }

    // MARK: - Abonnement (StoreKit 2, vérifié par l'appareil : aucun serveur nécessaire)

    private func status() async -> [String: Any] {
        var out: [String: Any] = ["active": false, "trial": false, "productId": subId]
        if let p = try? await Product.products(for: [subId]).first {
            out["price"] = p.displayPrice
            if let sub = p.subscription {
                out["eligibleTrial"] = await sub.isEligibleForIntroOffer
                if let o = sub.introductoryOffer, o.paymentMode == .freeTrial {
                    let u = o.period.unit
                    out["trialDays"] = o.period.value * (u == .day ? 1 : u == .week ? 7 : u == .month ? 30 : 365)
                }
            }
            out["loaded"] = true
        } else { out["loaded"] = false }
        for await result in Transaction.currentEntitlements {
            guard case .verified(let t) = result, t.productID == subId, t.revocationDate == nil else { continue }
            if let e = t.expirationDate, e < Date() { continue }
            out["active"] = true
            out["trial"] = t.offerType == .introductory
            if let e = t.expirationDate { out["expires"] = e.timeIntervalSince1970 * 1000 }
        }
        return out
    }

    @objc func subStatus(_ call: CAPPluginCall) {
        Task { call.resolve(await status()) }
    }

    @objc func subBuy(_ call: CAPPluginCall) {
        Task {
            do {
                guard let p = try await Product.products(for: [subId]).first else { call.reject("Abonnement indisponible pour le moment"); return }
                let r = try await p.purchase()
                switch r {
                case .success(let v):
                    if case .verified(let t) = v { await t.finish() } else { call.reject("Achat non vérifié"); return }
                case .userCancelled: var st = await status(); st["cancelled"] = true; call.resolve(st); return
                case .pending: var st = await status(); st["pending"] = true; call.resolve(st); return
                @unknown default: break
                }
                call.resolve(await status())
            } catch { call.reject(error.localizedDescription) }
        }
    }

    @objc func subRestore(_ call: CAPPluginCall) {
        Task {
            do { try await AppStore.sync() } catch { call.reject(error.localizedDescription); return }
            call.resolve(await status())
        }
    }

    @objc func subManage(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let scene = self.bridge?.viewController?.view.window?.windowScene else { call.reject("Indisponible"); return }
            do { try await AppStore.showManageSubscriptions(in: scene) } catch { call.reject(error.localizedDescription); return }
            call.resolve(await self.status())
        }
    }
}

/// Résultat du scanner de documents : pages redimensionnées (2480 px max, soit A4 à 300 ppp) puis en JPEG
extension PyramidNativePlugin: VNDocumentCameraViewControllerDelegate {
    public func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
        var pages: [String] = []
        for i in 0..<scan.pageCount {
            var img = scan.imageOfPage(at: i)
            let m = max(img.size.width, img.size.height)
            if m > 2480 {
                let k = 2480 / m, sz = CGSize(width: (img.size.width * k).rounded(), height: (img.size.height * k).rounded())
                let f = UIGraphicsImageRendererFormat.default(); f.scale = 1
                img = UIGraphicsImageRenderer(size: sz, format: f).image { _ in img.draw(in: CGRect(origin: .zero, size: sz)) }
            }
            if let d = img.jpegData(compressionQuality: 0.85) { pages.append(d.base64EncodedString()) }
        }
        finishScan(controller, pages: pages, error: nil)
    }
    public func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
        finishScan(controller, pages: [], error: nil)
    }
    public func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) {
        finishScan(controller, pages: nil, error: error.localizedDescription)
    }
}
