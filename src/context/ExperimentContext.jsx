import React, { createContext, useContext, useEffect, useState } from 'react';
import { getExperiments } from '../services/api';

const ExperimentContext = createContext({
  variants: {},
  loading: true
});

export const ExperimentProvider = ({ children }) => {
  const [variants, setVariants] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    
    getExperiments()
      .then(data => {
        if (isMounted) {
          setVariants(data || {});
          setLoading(false);
        }
      })
      .catch(err => {
        console.error("Failed to load experiments, using fallback:", err);
        if (isMounted) setLoading(false);
      });
      
    return () => { isMounted = false; };
  }, []);

  return (
    <ExperimentContext.Provider value={{ variants, loading }}>
      {children}
    </ExperimentContext.Provider>
  );
};

export const useExperiment = (experimentName) => {
  const { variants, loading } = useContext(ExperimentContext);
  
  if (loading) return 'control'; // Fallback to control while loading
  return variants[experimentName] || 'control'; // Fallback if not assigned
};

export const useAllExperiments = () => {
  const { variants } = useContext(ExperimentContext);
  return variants;
};
