import UIKit
import Capacitor

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
        CAPPluginMethod(name: "readUri", returnType: CAPPluginReturnPromise)
    ]
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
}
