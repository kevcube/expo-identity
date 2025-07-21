import ExpoModulesCore
import PassKit
import UIKit

// MARK: - PassKit Bridging Helpers
// -----------------------------------------------------------------------------
// These retroactive `Convertible` conformances let Expo bridge JSON coming from
// React‑Native to strongly‑typed PassKit enums / classes.

@available(iOS 16.0, *)
extension PKIdentityIntentToStore: @retroactive Convertible {
  public static func convert(from value: Any?, appContext _: AppContext) throws -> Self {
    guard
      let dict = value as? [String: Any],
      let intent = dict["intentToStore"] as? String
    else {
      throw Conversions.ConvertingException<Self>(value)
    }

    switch intent {
    case "willNotStore":
      return Self.willNotStore as! Self

    case "mayStore":
      if let days = dict["days"] as? Int {
    
    return Self.mayStore(days: days)     // parameterised variant
        
      }
      return Self.mayStore as! Self

    default:
      throw Conversions.ConvertingException<Self>(value)
    }
  }
}

// Common identity elements.
@available(iOS 16.0, *)
public extension PKIdentityElement {
  static func convert(from value: Any?, appContext _: AppContext) throws -> Self {
    guard let str = value as? String else {
      throw Conversions.ConvertingException<Self>(value)
    }

    switch str {
    case "givenName":              return Self.givenName as! Self
    case "familyName":             return Self.familyName as! Self
    case "portrait":               return Self.portrait as! Self
    case "address":                return Self.address as! Self
    case "documentNumber":         return Self.documentNumber as! Self
    case "dateOfBirth":            return Self.dateOfBirth as! Self
    case "age":                    return Self.age as! Self
    case "sex":
      if #available(iOS 17.2, *) { return Self.sex as! Self }
      break
    case "issuingAuthority":       return Self.issuingAuthority as! Self
    case "documentExpirationDate": return Self.documentExpirationDate as! Self
    case "documentIssueDate":      return Self.documentIssueDate as! Self
    case "drivingPrivilege":       return Self.drivingPrivileges as! Self
    default:
      break
    }

    throw Conversions.ConvertingException<Self>(value)
  }
}

// MARK: - Expo Module
// -----------------------------------------------------------------------------
@available(iOS 16.0, *)
public class ExpoIdentityModule: Module {
  private var activeController: PKIdentityAuthorizationController?

  public func definition() -> ModuleDefinition {
    Name("ExpoIdentity")

    // Simple capability probe -------------------------------------------------
    AsyncFunction("canRequestIdentityDocument") { (documentKind: String, promise: Promise) in
      Task {
        guard let descriptor = ExpoIdentityModule.makeDescriptor(for: documentKind) else {
          promise.resolve(false)
          return
        }
        let ok = await PKIdentityAuthorizationController().canRequestDocument(descriptor)
        promise.resolve(ok)
      }
    }

    // Main request ------------------------------------------------------------
    AsyncFunction("requestIdentityDocument") { (documentRequest: [String: Any], promise: Promise) in
      do {
        guard let pkRequest = try ExpoIdentityModule.buildPKRequest(from: documentRequest) else {
          promise.reject("ERR_INVALID_REQUEST",
                         "No valid identity documents or elements provided.")
          return
        }

        pkRequest.merchantIdentifier = Bundle.main.bundleIdentifier ?? ""

        // Use the PassKit async API
        Task { [weak self] in
          do {
            let controller = PKIdentityAuthorizationController()
            self?.activeController = controller
            let _ = try await controller.requestDocument(pkRequest)
            promise.resolve(true)
          } catch {
            promise.reject("REQUEST_FAILED", error.localizedDescription)
          }
        }
      } catch {
        promise.reject("ERR_REQUEST_BUILD", error.localizedDescription)
      }
    }
  }

  // MARK: - Helpers
  // ---------------------------------------------------------------------------

  /// Parse the JS request object into a PassKit `PKIdentityRequest`.
  private static func buildPKRequest(from js: [String: Any]) throws -> PKIdentityRequest? {
    var descriptors: [PKIdentityDocumentDescriptor] = []

    for (docKey, specAny) in js {
      guard let spec = specAny as? [String: Any],
            let elementItems = spec["elements"] as? [Any] else { continue }

      // 1. Descriptor per document type
      guard let descriptor = makeDescriptor(for: docKey) else { continue }

      // 2. Per‑document intent (defaults to willNotStore)
      var intent: PKIdentityIntentToStore = .willNotStore
      if let intentDict = spec["intentToStore"] as? [String: Any] {
        intent = try PKIdentityIntentToStore.convert(from: intentDict, appContext: .init())
      }

      // 3. Elements (strings or {type:"ageAtLeast",threshold:n})
      let elements: [PKIdentityElement] = elementItems.compactMap { item in
        if let str = item as? String {
          return try? PKIdentityElement.convert(from: str, appContext: .init())
        }
        if let obj = item as? [String: Any],
           let t = obj["type"] as? String,
           t == "ageAtLeast",
           let n = obj["threshold"] as? Int,
           #available(iOS 17.2, *) {
          return PKIdentityElement.age(atLeast: n)
        }
        return nil
      }

      guard !elements.isEmpty else { continue }
      descriptor.addElements(elements, intentToStore: intent)
      descriptors.append(descriptor)
    }

    guard !descriptors.isEmpty else { return nil }

    // Combine descriptors as allowed by the OS version
    let request = PKIdentityRequest()
    if descriptors.count == 1 {
      request.descriptor = descriptors[0]
    } else {
      if #available(iOS 26.0, *) {
        request.descriptor = PKIdentityAnyOfDescriptor(descriptors: descriptors)
      } else {
        throw Exception(
          name: "ERR_MULTI_DOC_UNSUPPORTED",
          description: "Requesting multiple document types requires iOS 26 or newer.",
          code: "ERR_MULTI_DOC_UNSUPPORTED"
        )
      }
    }
    return request
  }

  /// Map "driversLicense" | "nationalIDCard" | "photoID" -> concrete descriptor
  private static func makeDescriptor(for key: String) -> PKIdentityDocumentDescriptor? {
    switch key {
    case "driversLicense":
      return PKIdentityDriversLicenseDescriptor()

    case "nationalIDCard":
      if #available(iOS 18.0, *) { return PKIdentityNationalIDCardDescriptor() }
      return nil

    case "photoID":
      if #available(iOS 26.0, *) { return PKIdentityPhotoIDDescriptor() }
      return nil

    default:
      return nil
    }
  }
}
