/**
 * @file ActionMenu.tsx
 * @description A highly reusable and generic Action Menu component for the Sidebar items.
 * Supports various actions like Rename, Delete, Copy Link, Duplicate, etc.,
 * complete with icons and shortcut hints.
 * Fully powered by Radix UI / Shadcn DropdownMenu for accessibility and robust positioning.
 */

import React from 'react';
import { MoreHorizontal } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface ActionMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  destructive?: boolean;
  onClick: (e: React.MouseEvent) => void;
  divided?: boolean; // Whether to show a top divider
}

interface ActionMenuProps {
  items: ActionMenuItem[];
  triggerIcon?: React.ReactNode;
  triggerClassName?: string;
  menuWidth?: string;
  align?: 'start' | 'center' | 'end';
  menuTitle?: string;
}

export const ActionMenu = React.memo(function ActionMenu({
  items,
  triggerIcon = <MoreHorizontal size={14} />,
  triggerClassName = '',
  menuWidth = 'w-56',
  align = 'end',
  menuTitle,
}: ActionMenuProps) {

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={`p-1 rounded-md transition-colors hover:bg-app-hover focus:outline-none focus:ring-1 focus:ring-ring flex items-center justify-center text-app-fg-light hover:text-app-fg-deeper data-[state=open]:bg-app-hover data-[state=open]:text-app-fg-deeper ${triggerClassName}`}
          aria-label="操作菜单"
        >
          {triggerIcon}
        </button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent 
        align={align} 
        className={`${menuWidth} py-1`}
        onClick={(e) => e.stopPropagation()} // Prevent bubbling to the sidebar item
      >
        {menuTitle && (
          <>
            <DropdownMenuLabel className="px-2 py-1.5 text-xs text-app-fg-light font-medium tracking-wide">
              {menuTitle}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        
        {items.map((item, index) => (
          <React.Fragment key={item.id}>
            {item.divided && index !== 0 && <DropdownMenuSeparator />}
            
            <DropdownMenuItem
              onSelect={(e) => {
                // Let Radix handle the menu closing normally, then trigger our onClick
                item.onClick(e as unknown as React.MouseEvent<HTMLDivElement>);
              }}
              className={`group flex items-center justify-between cursor-pointer py-1.5 px-2 ${
                item.destructive ? 'text-destructive focus:text-destructive focus:bg-destructive/10' : ''
              }`}
            >
              <div className="flex items-center gap-2 flex-1 w-full">
                {item.icon && (
                  <span className={`shrink-0 opacity-70 group-hover:opacity-100 transition-opacity ${item.destructive ? 'text-destructive' : ''}`}>
                    {item.icon}
                  </span>
                )}
                <span className={`truncate text-[13px] ${item.destructive ? 'font-medium' : 'text-app-fg-deep'}`}>
                  {item.label}
                </span>
              </div>
              
              {item.shortcut && (
                <DropdownMenuShortcut className="ml-auto opacity-60 font-mono text-[10px]">
                  {item.shortcut}
                </DropdownMenuShortcut>
              )}
            </DropdownMenuItem>
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
