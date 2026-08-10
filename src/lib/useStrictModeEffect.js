import { useEffect, useRef } from 'react';

/**
 * A custom hook that handles React Strict Mode's double-mount pattern for async effects.
 *
 * This hook prevents duplicate API calls in development by:
 * 1. Using a ref to track if the effect has already run for the current dependencies
 * 2. Properly resetting state when the component unmounts during async operations
 * 3. Allowing the effect to run again when the component remounts, OR when
 *    the dependency array actually changes (e.g. a search term or selected id)
 *
 * @param {Function} effect - Async function to run. Will receive a cleanup object with:
 *   - mounted: ref to check if component is still mounted
 *   - resetOnUnmount: function to reset loading state and ref when unmounted
 * @param {Array} dependencies - Dependency array for the effect
 * @param {Object} options - Optional configuration
 * @param {Function} options.setLoading - Function to set loading state (if applicable)
 *
 * @example
 * useStrictModeEffect(
 *   async ({ mounted, resetOnUnmount }) => {
 *     const token = await getToken();
 *     if (!mounted.current) {
 *       resetOnUnmount();
 *       return;
 *     }
 *     const data = await fetchData(token);
 *     if (!mounted.current) {
 *       resetOnUnmount();
 *       return;
 *     }
 *     setData(data);
 *   },
 *   [dependency1, dependency2],
 *   { setLoading }
 * );
 */
export function useStrictModeEffect(effect, dependencies = [], options = {}) {
  const fetchedRef = useRef(false);
  const prevDependenciesRef = useRef(dependencies);
  const { setLoading } = options;

  useEffect(() => {
    // A genuine dependency change (e.g. a search term or selected
    // pipeline) must always re-run the effect — only Strict Mode's
    // same-render double-invocation should be suppressed. Without
    // this, fetchedRef.current stays true forever after the first
    // successful fetch and no dependency change ever re-fetches.
    const dependenciesChanged = dependencies.some(
      (dep, i) => dep !== prevDependenciesRef.current[i]
    );
    prevDependenciesRef.current = dependencies;
    if (fetchedRef.current && !dependenciesChanged) return;

    const mounted = { current: true };

    const resetOnUnmount = () => {
      fetchedRef.current = false;
      if (setLoading) {
        setLoading(false);
      }
    };

    const runEffect = async () => {
      // Mark as fetched BEFORE starting work to prevent race conditions
      fetchedRef.current = true;

      if (setLoading) {
        setLoading(true);
      }

      try {
        await effect({ mounted, resetOnUnmount });
      } catch (error) {
        // If there's an error, reset the ref so it can be retried
        if (mounted.current) {
          fetchedRef.current = false;
        }
        throw error;
      } finally {
        if (mounted.current && setLoading) {
          setLoading(false);
        }
      }
    };

    runEffect();

    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);
}
