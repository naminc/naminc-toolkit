import { Base64Tool } from "@/components/tools/base64-tool";
import { ApiClientTool } from "@/components/tools/api-client-tool";
import { ColorConverterTool } from "@/components/tools/color-converter-tool";
import { HashTool } from "@/components/tools/hash-tool";
import { JsonTool } from "@/components/tools/json-tool";
import { JwtTool } from "@/components/tools/jwt-tool";
import { RegexTool } from "@/components/tools/regex-tool";
import { TimestampTool } from "@/components/tools/timestamp-tool";
import { TotpTool } from "@/components/tools/totp-tool";
import { UrlTool } from "@/components/tools/url-tool";
import { UuidTool } from "@/components/tools/uuid-tool";

const workspaces: Record<string, React.ComponentType> = {
  "api-client": ApiClientTool,
  "color-converter": ColorConverterTool,
  "json-formatter": JsonTool,
  "jwt-decoder": JwtTool,
  "base64": Base64Tool,
  "timestamp-converter": TimestampTool,
  "totp-generator": TotpTool,
  "uuid-generator": UuidTool,
  "url-encoder": UrlTool,
  "hash-generator": HashTool,
  "regex-tester": RegexTool,
};

export function ToolWorkspace({ slug }: { slug: string }) {
  const Workspace = workspaces[slug];
  return Workspace ? <Workspace /> : null;
}
