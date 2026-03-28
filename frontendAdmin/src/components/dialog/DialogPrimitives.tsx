import {
  createContext,
  forwardRef,
  type HTMLAttributes,
  type MouseEventHandler,
  type MutableRefObject,
  type ReactNode,
  type Ref,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';

interface DialogRootProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  closeOnEsc?: boolean;
  closeOnOverlayClick?: boolean;
  lockScroll?: boolean;
  trapFocus?: boolean;
  restoreFocus?: boolean;
}

interface DialogContextValue {
  dialogId: string;
  onClose: () => void;
  closeOnOverlayClick: boolean;
  contentRef: MutableRefObject<HTMLDivElement | null>;
}

const DialogContext = createContext<DialogContextValue | null>(null);
const activeDialogStack: string[] = [];

let bodyLockCount = 0;
let previousBodyOverflow = '';
let previousBodyPaddingRight = '';

function lockBodyScroll(): void {
  if (typeof document === 'undefined') {
    return;
  }

  if (bodyLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    previousBodyPaddingRight = document.body.style.paddingRight;

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }

  bodyLockCount += 1;
}

function unlockBodyScroll(): void {
  if (typeof document === 'undefined' || bodyLockCount === 0) {
    return;
  }

  bodyLockCount -= 1;
  if (bodyLockCount > 0) {
    return;
  }

  document.body.style.overflow = previousBodyOverflow;
  document.body.style.paddingRight = previousBodyPaddingRight;
}

function removeDialogFromStack(dialogId: string): void {
  const index = activeDialogStack.lastIndexOf(dialogId);
  if (index >= 0) {
    activeDialogStack.splice(index, 1);
  }
}

function isTopMostDialog(dialogId: string): boolean {
  return activeDialogStack[activeDialogStack.length - 1] === dialogId;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
    (element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true',
  );
}

function focusFirstElement(container: HTMLElement): void {
  const focusableElements = getFocusableElements(container);
  if (focusableElements.length > 0) {
    focusableElements[0].focus();
    return;
  }

  container.focus();
}

function useDialogContext(componentName: string): DialogContextValue {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error(`${componentName} must be used within DialogRoot.`);
  }

  return context;
}

function setMergedRef<T>(ref: Ref<T | null> | null | undefined, value: T | null): void {
  if (!ref) {
    return;
  }

  if (typeof ref === 'function') {
    ref(value);
    return;
  }

  (ref as MutableRefObject<T | null>).current = value;
}

export function DialogRoot({
  open,
  onClose,
  children,
  closeOnEsc = true,
  closeOnOverlayClick = true,
  lockScroll = true,
  trapFocus = true,
  restoreFocus = true,
}: DialogRootProps) {
  const reactId = useId();
  const dialogId = useMemo(() => `dialog-${reactId}`, [reactId]);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const previousFocusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open || typeof document === 'undefined') {
      return;
    }

    previousFocusedElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    activeDialogStack.push(dialogId);
    if (lockScroll) {
      lockBodyScroll();
    }

    const focusFrame = window.requestAnimationFrame(() => {
      const container = contentRef.current;
      if (!container) {
        return;
      }

      const activeElement = document.activeElement;
      if (!(activeElement instanceof Node) || !container.contains(activeElement)) {
        focusFirstElement(container);
      }
    });

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (!isTopMostDialog(dialogId)) {
        return;
      }

      if (event.key === 'Escape' && closeOnEsc) {
        if (event.defaultPrevented) {
          return;
        }

        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !trapFocus) {
        return;
      }

      const container = contentRef.current;
      if (!container) {
        return;
      }

      const focusableElements = getFocusableElements(container);
      if (focusableElements.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const isFocusInside = activeElement ? container.contains(activeElement) : false;

      if (event.shiftKey) {
        if (!isFocusInside || activeElement === firstElement || activeElement === container) {
          event.preventDefault();
          lastElement.focus();
        }
        return;
      }

      if (!isFocusInside || activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    const handleDocumentFocusIn = (event: FocusEvent) => {
      if (!trapFocus || !isTopMostDialog(dialogId)) {
        return;
      }

      const container = contentRef.current;
      if (!container) {
        return;
      }

      if (event.target instanceof Node && container.contains(event.target)) {
        return;
      }

      focusFirstElement(container);
    };

    document.addEventListener('keydown', handleDocumentKeyDown);
    document.addEventListener('focusin', handleDocumentFocusIn);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleDocumentKeyDown);
      document.removeEventListener('focusin', handleDocumentFocusIn);
      removeDialogFromStack(dialogId);

      if (lockScroll) {
        unlockBodyScroll();
      }

      if (restoreFocus) {
        const previousFocusedElement = previousFocusedElementRef.current;
        if (previousFocusedElement) {
          window.requestAnimationFrame(() => {
            previousFocusedElement.focus();
          });
        }
      }
    };
  }, [closeOnEsc, dialogId, lockScroll, onClose, open, restoreFocus, trapFocus]);

  const contextValue = useMemo<DialogContextValue>(
    () => ({
      dialogId,
      onClose,
      closeOnOverlayClick,
      contentRef,
    }),
    [closeOnOverlayClick, dialogId, onClose],
  );

  if (!open || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <DialogContext.Provider value={contextValue}>{children}</DialogContext.Provider>,
    document.body,
  );
}

type DialogOverlayProps = HTMLAttributes<HTMLDivElement>;

export const DialogOverlay = forwardRef<HTMLDivElement, DialogOverlayProps>(function DialogOverlay(
  { onClick, ...props },
  forwardedRef,
) {
  const localOverlayRef = useRef<HTMLDivElement | null>(null);
  const { closeOnOverlayClick, onClose } = useDialogContext('DialogOverlay');

  useLayoutEffect(() => {
    setMergedRef(forwardedRef, localOverlayRef.current);

    return () => {
      setMergedRef(forwardedRef, null);
    };
  }, [forwardedRef]);

  const handleClick: MouseEventHandler<HTMLDivElement> = (event) => {
    onClick?.(event);
    if (event.defaultPrevented || !closeOnOverlayClick) {
      return;
    }

    onClose();
  };

  return (
    <div
      {...props}
      ref={localOverlayRef}
      aria-hidden="true"
      onClick={handleClick}
    />
  );
});

type DialogContentProps = HTMLAttributes<HTMLDivElement>;

export const DialogContent = forwardRef<HTMLDivElement, DialogContentProps>(function DialogContent(
  { onClick, tabIndex, role, ...props },
  forwardedRef,
) {
  const localContentRef = useRef<HTMLDivElement | null>(null);
  const { contentRef } = useDialogContext('DialogContent');

  useLayoutEffect(() => {
    const node = localContentRef.current;
    contentRef.current = node;
    setMergedRef(forwardedRef, node);

    return () => {
      if (contentRef.current === node) {
        contentRef.current = null;
      }
      setMergedRef(forwardedRef, null);
    };
  }, [contentRef, forwardedRef]);

  const handleClick: MouseEventHandler<HTMLDivElement> = (event) => {
    onClick?.(event);
  };

  return (
    <div
      {...props}
      ref={localContentRef}
      role={role ?? 'dialog'}
      aria-modal="true"
      tabIndex={tabIndex ?? -1}
      onClick={handleClick}
    />
  );
});
