type AnyFunction = (...args: any[]) => any;

export function throttle<T extends AnyFunction>(
    func: T,
    limit: number
): (...args: Parameters<T>) => ReturnType<T> | void {
    let inThrottle = false;
    return function(this: ThisParameterType<T>, ...args: Parameters<T>): ReturnType<T> | void {
        if (!inThrottle) {
            const result = func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
            return result;
        }
    };
} 