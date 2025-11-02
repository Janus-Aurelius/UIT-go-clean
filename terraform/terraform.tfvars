# Development environment specific values
aws_region    = "us-east-1"
environment   = "development"
project_name  = "uit-go-dev"

# VPC Configuration
vpc_cidr             = "10.0.0.0/16"
public_subnet_cidrs  = ["10.0.1.0/24", "10.0.2.0/24"]
enable_nat_gateway   = false

# Redis Configuration
redis_node_type = "cache.t3.micro"

# ECS Configuration
ecs_task_cpu    = 256
ecs_task_memory = 512

# Container Configuration
container_image_tag = "latest"

# Authentication (set this via environment variable or AWS Secrets Manager)
# clerk_secret_key = "your-clerk-secret-key"