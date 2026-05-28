# Frontend Dockerfile - uses pre-built dist
FROM nginx:1.27

# Copy pre-built files
COPY dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
