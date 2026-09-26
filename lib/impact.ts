export type ImpactInput = {
  targetPath: string;
  diff: string;
  importers: string[];
};

export type ImpactResult = {
  risk: "high" | "medium" | "low";
  reason: string;
  affected_count: number;
};

const SENSITIVE_PATHS = ["auth", "payment", "checkout", "session"];

export function assessImpact({ targetPath, importers }: ImpactInput): ImpactResult {
  const affectedCount = importers.length;
  const hasSensitiveImporter = importers.some((filePath) =>
    SENSITIVE_PATHS.some((keyword) => filePath.toLowerCase().includes(keyword)),
  );
  const risk = affectedCount >= 3 || hasSensitiveImporter
    ? "high"
    : affectedCount > 0
      ? "medium"
      : "low";
  const reason = affectedCount === 0
    ? `No listed files reference ${targetPath}.`
    : `${affectedCount} listed file${affectedCount === 1 ? " references " : "s reference "}${targetPath}${hasSensitiveImporter ? " and a referencing path contains a sensitive keyword." : "."}`;

  return { risk, reason, affected_count: affectedCount };
}