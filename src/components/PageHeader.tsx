import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-5 sm:mb-8 gap-3 sm:gap-6">
      <div className="max-w-[64ch] min-w-0">
        <h1 className="text-xl sm:text-2xl font-medium tracking-tight text-foreground text-balance">
          {title}
        </h1>
        {description ? (
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 text-pretty">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
