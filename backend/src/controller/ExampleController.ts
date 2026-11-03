import {Get, JsonController} from "routing-controllers";
import {OpenAPI} from "routing-controllers-openapi";

@JsonController("/test")
@OpenAPI({ tags: ["modules/example"] })
export default class ExampleController {

    @Get("/hello")
    async index() {
        return {
            message: "Hello World"
        };
    }
}