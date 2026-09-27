import type { ReactNode } from 'react';

interface Props {
    // Visible label. Pass a <label htmlFor> for a single input; plain text for groups.
    label: ReactNode;
    // Renders a fieldset whose legend is the label, for groups of controls.
    legend?: string;
    children: ReactNode;
}

// One settings row inside a box: label on the left, controls on the right, stacked on phones.
export function Row({ label, legend, children }: Props) {
    const body = (
        <>
            <div className="shrink-0 text-sm font-semibold sm:w-28 sm:pt-[5px]" aria-hidden={legend ? true : undefined}>
                {label}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">{children}</div>
        </>
    );
    const className = 'flex flex-col gap-2 border-t border-line px-4 py-4 first:border-t-0 sm:flex-row sm:gap-6';
    if (legend) {
        return (
            <fieldset className={className}>
                <legend className="sr-only">{legend}</legend>
                {body}
            </fieldset>
        );
    }
    return <div className={className}>{body}</div>;
}
