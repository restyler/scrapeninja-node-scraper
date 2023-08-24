# Set the base image. Node v16 in this case.
FROM node:16

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json before other files
# Utilize Docker cache to save re-installing dependencies if unchanged
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all files
COPY . .

RUN chmod +x /usr/src/app/init.sh


CMD ["node", "src/step1.js"]
