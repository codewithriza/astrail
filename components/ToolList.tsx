import { Badge } from "@/components/ui/badge";
import type { McpTool } from "@/lib/types";

export function ToolList({ tools }: { tools: McpTool[] }) {
  if (tools.length === 0) {
    return <p className="text-sm text-muted-foreground">No tools were extracted.</p>;
  }

  return (
    <div className="divide-y rounded-lg border bg-white">
      {tools.map((tool) => (
        <div key={`${tool.name}-${tool.path ?? ""}`} className="grid gap-2 p-3">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <code className="min-w-0 truncate text-sm font-semibold">{tool.name}</code>
            {(tool.method || tool.path) && (
              <div className="flex shrink-0 flex-wrap gap-2">
                {tool.method ? <Badge>{tool.method}</Badge> : null}
                {tool.path ? <Badge className="max-w-48 truncate font-mono">{tool.path}</Badge> : null}
              </div>
            )}
          </div>
          <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">{tool.description}</p>
        </div>
      ))}
    </div>
  );
}
