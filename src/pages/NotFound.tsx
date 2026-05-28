import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Home, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-6"
      >
        <motion.div
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1 }}
          className="text-8xl font-bold text-primary"
        >
          404
        </motion.div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Страница не найдена</h1>
          <p className="text-muted-foreground">
            К сожалению, запрашиваемая страница не существует
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button 
            variant="outline" 
            onClick={() => window.history.back()}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Назад
          </Button>
          <Link to="/">
            <Button className="gradient-accent text-primary-foreground gap-2 w-full sm:w-auto">
              <Home className="h-4 w-4" />
              На главную
            </Button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
};

export default NotFound;
