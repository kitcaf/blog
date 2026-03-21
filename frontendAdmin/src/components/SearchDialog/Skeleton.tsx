/**
 * @file Skeleton.tsx
 * @description 搜索骨架加载组件
 */

import React from 'react';

export default function SearchSkeleton() {
    return (
        <div className="space-y-4">
            {[1, 2].map((groupIndex) => (
                <div key={groupIndex} className="mb-4">
                    {/* 分组标题骨架 */}
                    <div className="px-2 py-2 mb-2">
                        <div className="h-3 w-16 bg-app-hover rounded animate-pulse" />
                    </div>
                    {/* 结果项骨架 */}
                    <div className="space-y-2">
                        {[1, 2].map((itemIndex) => (
                            <div
                                key={itemIndex}
                                className="px-4 py-3 rounded-xl bg-app-hover/30 animate-pulse"
                            >
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-5 h-5 bg-app-hover rounded" />
                                    <div className="h-4 w-48 bg-app-hover rounded" />
                                </div>
                                <div className="pl-7 space-y-1.5">
                                    <div className="h-3 w-full bg-app-hover rounded" />
                                    <div className="h-3 w-3/4 bg-app-hover rounded" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
