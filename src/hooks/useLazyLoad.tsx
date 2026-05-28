import { useEffect, useRef, useState } from 'react';

/**
 * Custom hook для lazy loading изображений
 * Загружает изображения только когда они появляются в viewport
 * 
 * @param threshold - Порог видимости (0-1, по умолчанию 0.1)
 * @returns [ref, isVisible] - Ref для элемента и флаг видимости
 * 
 * @example
 * const [ref, isVisible] = useLazyLoad();
 * 
 * return (
 *   <div ref={ref}>
 *     {isVisible && <img src={imageSrc} alt="..." />}
 *   </div>
 * );
 */
export function useLazyLoad<T extends HTMLElement = HTMLDivElement>(
    threshold: number = 0.1
): [React.RefObject<T>, boolean] {
    const ref = useRef<T>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    observer.disconnect();
                }
            },
            { threshold }
        );

        observer.observe(element);

        return () => {
            observer.disconnect();
        };
    }, [threshold]);

    return [ref, isVisible];
}
