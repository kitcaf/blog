/**
 * @file Skeleton.tsx
 * @description 回收站骨架加载组件
 */

export default function TrashSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map((index) => (
        <div
          key={index}
          className="px-4 py-4 rounded-xl bg-app-hover/30 animate-pulse"
        >
          <div className="flex items-center gap-4">
            {/* Checkbox */}
            <div className="w-4 h-4 bg-app-hover rounded flex-shrink-0" />
            
            {/* Icon & Content */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-6 h-6 bg-app-hover rounded flex-shrink-0" />
              <div className="w-4 h-4 bg-app-hover rounded flex-shrink-0" />
              <div className="flex-1 min-w-0 space-y-2">
                <div className="h-4 w-48 bg-app-hover rounded" />
                <div className="h-3 w-64 bg-app-hover rounded" />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="w-8 h-8 bg-app-hover rounded-lg" />
              <div className="w-8 h-8 bg-app-hover rounded-lg" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
