/**
 * AI Creative OS - License Engine
 * 
 * Manages all license types: software, models, weights, workflows, plugins, assets.
 * Never assumes "open source = permissive" or "open weights = commercial".
 * BLOCKS usage when license conditions are not met.
 */

import {
  LicenseInfo, LicenseType, LicenseScope, Provider, UniqueId,
} from "../types/index.js";
import { Logger, EventBus, Registry } from "../core/index.js";

// ─── License Record ──────────────────────────────────────────────────────────

export interface LicenseRecord {
  id: UniqueId;
  targetType: "software" | "model" | "weights" | "workflow" | "plugin" | "asset";
  targetId: UniqueId;
  license: LicenseInfo;
  source?: string;
  verified: boolean;
  verifiedAt?: number;
  notes?: string;
}

export interface LicenseVerdict {
  allowed: boolean;
  reason: string;
  restrictions: string[];
  recommendation?: string;
}

// ─── License Engine ──────────────────────────────────────────────────────────

export class LicenseEngine {
  private records = new Map<UniqueId, LicenseRecord>();
  private logger = new Logger("LicenseEngine");
  private eventBus: EventBus;
  private userAgreements = new Map<string, boolean>();

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Register a license record.
   */
  register(record: LicenseRecord): void {
    this.records.set(record.id, record);
    this.logger.debug(`Registered license: ${record.targetId} (${record.license.softwareLicense})`);
  }

  /**
   * Check if a provider can be used under the current configuration.
   */
  canUseProvider(
    provider: Provider,
    context: { commercialUse?: boolean; redistribute?: boolean } = {},
  ): LicenseVerdict {
    const { commercialUse = false, redistribute = false } = context;
    const license = provider.license;
    const restrictions: string[] = [];

    // Commercial use check
    if (commercialUse && !license.commercialUse) {
      restrictions.push("Commercial use is NOT permitted under this license");
      return {
        allowed: false,
        reason: `${provider.name} uses ${license.softwareLicense} which does not permit commercial use`,
        restrictions,
        recommendation: "Find an alternative provider with a permissive license",
      };
    }

    // Redistribution check
    if (redistribute && !license.redistribution) {
      restrictions.push("Redistribution is NOT permitted");
      return {
        allowed: false,
        reason: `${provider.name} uses ${license.softwareLicense} which does not permit redistribution`,
        restrictions,
        recommendation: "Use the output locally without redistribution",
      };
    }

    // Copyleft implications
    if (license.softwareLicenseScope === "copyleft") {
      restrictions.push("Copyleft: derivative works must use same license");
      return {
        allowed: true,
        reason: "Usage allowed but copyleft obligations apply",
        restrictions,
        recommendation: "Ensure compliance with copyleft requirements",
      };
    }

    // Weak copyleft
    if (license.softwareLicenseScope === "weak_copyleft") {
      restrictions.push("Weak copyleft: modifications to the library itself must be shared");
    }

    // Proprietary with restrictions
    if (license.softwareLicenseScope === "proprietary") {
      if (license.restrictions) {
        restrictions.push(...license.restrictions);
      }
    }

    return {
      allowed: true,
      reason: "No license restrictions block this usage",
      restrictions,
    };
  }

  /**
   * Check if a model can be used.
   */
  canUseModel(
    modelName: string,
    modelLicense: LicenseType,
    context: { commercialUse?: boolean } = {},
  ): LicenseVerdict {
    const restrictions: string[] = [];

    switch (modelLicense) {
      case "MIT":
      case "Apache-2.0":
      case "BSD-2-Clause":
      case "BSD-3-Clause":
        return { allowed: true, reason: "Permissive license", restrictions: [] };

      case "GPL-2.0":
      case "GPL-3.0":
        restrictions.push("Copyleft: works using this model must be GPL-licensed");
        return {
          allowed: true,
          reason: "GPL model - usage allowed with copyleft obligations",
          restrictions,
          recommendation: context.commercialUse
            ? "Consult legal counsel for commercial use implications"
            : undefined,
        };

      case "LGPL-2.1":
      case "LGPL-3.0":
        return {
          allowed: true,
          reason: "LGPL - usage allowed with weak copyleft obligations",
          restrictions: ["Modifications to the model itself must be shared"],
        };

      case "proprietary":
        if (context.commercialUse) {
          return {
            allowed: false,
            reason: "Proprietary model - commercial use requires explicit permission",
            restrictions: ["Commercial use restrictions apply"],
            recommendation: "Check model provider's terms of service",
          };
        }
        return {
          allowed: true,
          reason: "Proprietary model - personal use may be permitted",
          restrictions: ["Check model provider's terms of service"],
        };

      default:
        return {
          allowed: false,
          reason: "Unknown license - cannot determine usage rights",
          restrictions: ["License not recognized"],
          recommendation: "Manually verify the model license before use",
        };
    }
  }

  /**
   * Build a full license matrix for all registered providers.
   */
  buildMatrix(providers: Provider[]): LicenseMatrixRow[] {
    return providers.map((p) => ({
      providerId: p.id,
      providerName: p.name,
      softwareLicense: p.license.softwareLicense,
      softwareLicenseScope: p.license.softwareLicenseScope,
      modelLicense: p.license.modelLicense,
      commercialUse: p.license.commercialUse,
      redistribution: p.license.redistribution,
      modification: p.license.modification,
      restrictions: p.license.restrictions ?? [],
    }));
  }

  /**
   * Record user agreement to license terms.
   */
  agreeToLicense(targetId: string): void {
    this.userAgreements.set(targetId, true);
    this.eventBus.emit("LICENSE_AGREED", "LicenseEngine", { targetId });
  }

  hasAgreed(targetId: string): boolean {
    return this.userAgreements.get(targetId) === true;
  }
}

export interface LicenseMatrixRow {
  providerId: UniqueId;
  providerName: string;
  softwareLicense: LicenseType;
  softwareLicenseScope: LicenseScope;
  modelLicense?: LicenseType;
  commercialUse: boolean;
  redistribution: boolean;
  modification: boolean;
  restrictions: string[];
}
