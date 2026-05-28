/**
 * Animation constants for consistent motion design across the app
 * Используется с framer-motion для единообразных анимаций
 */

export const ANIMATION = {
  // Duration (в секундах)
  duration: {
    instant: 0.1,
    fast: 0.15,
    normal: 0.3,
    slow: 0.5,
    verySlow: 0.8,
  },

  // Easing functions
  easing: {
    // Smooth easing для большинства анимаций
    smooth: [0.4, 0, 0.2, 1],

    // Bounce easing для playful эффектов
    bounce: [0.68, -0.55, 0.265, 1.55],

    // Sharp easing для быстрых переходов
    sharp: [0.4, 0, 0.6, 1],

    // Ease out для входящих элементов
    easeOut: [0, 0, 0.2, 1],

    // Ease in для исчезающих элементов
    easeIn: [0.4, 0, 1, 1],
  },

  // Preset variants для framer-motion
  variants: {
    // Fade in/out
    fade: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
    },

    // Slide from bottom
    slideUp: {
      initial: { opacity: 0, y: 20 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: 20 },
    },

    // Slide from top
    slideDown: {
      initial: { opacity: 0, y: -20 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: -20 },
    },

    // Slide from left
    slideRight: {
      initial: { opacity: 0, x: -20 },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 0, x: -20 },
    },

    // Slide from right
    slideLeft: {
      initial: { opacity: 0, x: 20 },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 0, x: 20 },
    },

    // Scale up
    scaleUp: {
      initial: { opacity: 0, scale: 0.9 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 0.9 },
    },

    // Scale down
    scaleDown: {
      initial: { opacity: 0, scale: 1.1 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 1.1 },
    },

    // Stagger children
    staggerContainer: {
      animate: {
        transition: {
          staggerChildren: 0.1,
        },
      },
    },
  },

  // Transition presets
  transition: {
    // Default smooth transition
    smooth: {
      duration: 0.3,
      ease: [0.4, 0, 0.2, 1],
    },

    // Fast transition
    fast: {
      duration: 0.15,
      ease: [0.4, 0, 0.2, 1],
    },

    // Slow transition
    slow: {
      duration: 0.5,
      ease: [0.4, 0, 0.2, 1],
    },

    // Spring transition
    spring: {
      type: 'spring',
      stiffness: 400,
      damping: 30,
    },

    // Bouncy spring
    bouncySpring: {
      type: 'spring',
      stiffness: 300,
      damping: 20,
    },

    // Stiff spring
    stiffSpring: {
      type: 'spring',
      stiffness: 500,
      damping: 40,
    },
  },

  // Hover effects
  hover: {
    // Subtle lift
    lift: {
      y: -5,
      scale: 1.02,
      transition: { duration: 0.2 },
    },

    // Scale up
    scale: {
      scale: 1.05,
      transition: { duration: 0.2 },
    },

    // Glow effect (используется с shadow)
    glow: {
      boxShadow: '0 0 20px rgba(99, 102, 241, 0.5)',
      transition: { duration: 0.2 },
    },
  },

  // Tap effects
  tap: {
    // Scale down
    scale: {
      scale: 0.95,
    },

    // Slight scale
    subtle: {
      scale: 0.98,
    },
  },
};

// Helper function для создания stagger анимации
export function createStaggerVariants(staggerDelay = 0.1) {
  return {
    container: {
      animate: {
        transition: {
          staggerChildren: staggerDelay,
        },
      },
    },
    item: {
      initial: { opacity: 0, y: 20 },
      animate: { opacity: 1, y: 0 },
    },
  };
}

// Helper function для page transitions
export function createPageTransition(direction: 'up' | 'down' | 'left' | 'right' = 'up') {
  const directions = {
    up: { y: 20 },
    down: { y: -20 },
    left: { x: 20 },
    right: { x: -20 },
  };

  return {
    initial: { opacity: 0, ...directions[direction] },
    animate: { opacity: 1, x: 0, y: 0 },
    exit: { opacity: 0, ...directions[direction] },
    transition: ANIMATION.transition.smooth,
  };
}
