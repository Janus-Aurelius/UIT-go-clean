# ECS Task Definitions for microservices

# API Gateway Task Definition
resource "aws_ecs_task_definition" "api_gateway" {
  family                   = "${var.project_name}-api-gateway"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.ecs_task_cpu
  memory                   = var.ecs_task_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn

  container_definitions = jsonencode([
    {
      name  = "api-gateway"
      image = "${var.project_name}/api-gateway:${var.container_image_tag}"
      portMappings = [
        {
          containerPort = 3000
          protocol      = "tcp"
        }
      ]
      environment = [
        {
          name  = "USER_GRPC_URL"
          value = "user-service:50051"
        },
        {
          name  = "DRIVER_GRPC_URL"
          value = "driver-service:50052"
        },
        {
          name  = "TRIP_GRPC_URL"
          value = "trip-service:50053"
        },
        {
          name  = "CLERK_SECRET_KEY"
          value = var.clerk_secret_key
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.api_gateway.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
      essential = true
    }
  ])

  tags = {
    Name        = "${var.project_name}-api-gateway-task"
    Environment = var.environment
  }
}

# User Service Task Definition
resource "aws_ecs_task_definition" "user_service" {
  family                   = "${var.project_name}-user-service"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.ecs_task_cpu
  memory                   = var.ecs_task_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn

  container_definitions = jsonencode([
    {
      name  = "user-service"
      image = "${var.project_name}/user-service:${var.container_image_tag}"
      portMappings = [
        {
          containerPort = 50051
          protocol      = "tcp"
        }
      ]
      environment = [
        {
          name  = "USER_GRPC_URL"
          value = "0.0.0.0:50051"
        },
        {
          name  = "DRIVER_GRPC_URL"
          value = "driver-service:50052"
        },
        {
          name  = "TRIP_GRPC_URL"
          value = "trip-service:50053"
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.user_service.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
      essential = true
    }
  ])

  tags = {
    Name        = "${var.project_name}-user-service-task"
    Environment = var.environment
  }
}

# Driver Service Task Definition
resource "aws_ecs_task_definition" "driver_service" {
  family                   = "${var.project_name}-driver-service"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.ecs_task_cpu
  memory                   = var.ecs_task_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn

  container_definitions = jsonencode([
    {
      name  = "driver-service"
      image = "${var.project_name}/driver-service:${var.container_image_tag}"
      portMappings = [
        {
          containerPort = 50052
          protocol      = "tcp"
        }
      ]
      environment = [
        {
          name  = "DRIVER_GRPC_URL"
          value = "0.0.0.0:50052"
        },
        {
          name  = "REDIS_URL"
          value = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:${aws_elasticache_cluster.redis.cache_nodes[0].port}"
        },
        {
          name  = "USER_GRPC_URL"
          value = "user-service:50051"
        },
        {
          name  = "TRIP_GRPC_URL"
          value = "trip-service:50053"
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.driver_service.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
      essential = true
    }
  ])

  tags = {
    Name        = "${var.project_name}-driver-service-task"
    Environment = var.environment
  }
}

# Trip Service Task Definition
resource "aws_ecs_task_definition" "trip_service" {
  family                   = "${var.project_name}-trip-service"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.ecs_task_cpu
  memory                   = var.ecs_task_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn

  container_definitions = jsonencode([
    {
      name  = "trip-service"
      image = "${var.project_name}/trip-service:${var.container_image_tag}"
      portMappings = [
        {
          containerPort = 50053
          protocol      = "tcp"
        }
      ]
      environment = [
        {
          name  = "TRIP_GRPC_URL"
          value = "0.0.0.0:50053"
        },
        {
          name  = "USER_GRPC_URL"
          value = "user-service:50051"
        },
        {
          name  = "DRIVER_GRPC_URL"
          value = "driver-service:50052"
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.trip_service.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
      essential = true
    }
  ])

  tags = {
    Name        = "${var.project_name}-trip-service-task"
    Environment = var.environment
  }
}

# CloudWatch Log Groups
resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/ecs/${var.project_name}-api-gateway"
  retention_in_days = 7

  tags = {
    Name        = "${var.project_name}-api-gateway-logs"
    Environment = var.environment
  }
}

resource "aws_cloudwatch_log_group" "user_service" {
  name              = "/ecs/${var.project_name}-user-service"
  retention_in_days = 7

  tags = {
    Name        = "${var.project_name}-user-service-logs"
    Environment = var.environment
  }
}

resource "aws_cloudwatch_log_group" "driver_service" {
  name              = "/ecs/${var.project_name}-driver-service"
  retention_in_days = 7

  tags = {
    Name        = "${var.project_name}-driver-service-logs"
    Environment = var.environment
  }
}

resource "aws_cloudwatch_log_group" "trip_service" {
  name              = "/ecs/${var.project_name}-trip-service"
  retention_in_days = 7

  tags = {
    Name        = "${var.project_name}-trip-service-logs"
    Environment = var.environment
  }
}